import { IBus, IModbusConnection, Islave, OWN_SLAVE_FIELDS, Slave } from '../shared/server/index.js'
import { ConfigSpecification, Logger, LogLevelEnum } from '../specification/index.js'
import { getSpecificationI18nEntityName, IidentEntity, Ispecification } from '../shared/specification/index.js'

import Debug from 'debug'
import { Config, ConfigListenerEvent } from './config.js'
import { ConfigPersistence } from './persistence/configPersistence.js'
import { SerialPort } from 'serialport'
import { BusPersistence } from './persistence/busPersistence.js'
import * as fs from 'fs'
const log = new Logger('config')
const debug = Debug('configbus')

interface HassioHardwareInfo {
  data: {
    devices: Array<{
      subsystem?: string
      dev_path: string
    }>
  }
}

/** Thrown when a slave that others reference would be deleted. The HTTP layer maps it to 409. */
export class SlaveReferencedError extends Error {
  constructor(
    readonly slaveid: number,
    readonly referencingSlaveIds: number[]
  ) {
    super('Slave ' + slaveid + ' is referenced by slave(s) ' + referencingSlaveIds.join(', '))
  }
}

export class ConfigBus {
  private static busses: IBus[]
  private static persistence: BusPersistence
  private static listeners: {
    event: ConfigListenerEvent
    listener: ((arg: Slave, spec: Ispecification | undefined) => void) | ((arg: number) => void)
  }[] = []

  private static persistenceLocalDir: string = ''

  private static ensurePersistence(): BusPersistence {
    const localDir = ConfigPersistence.getLocalDir()
    if (!ConfigBus.persistence || ConfigBus.persistenceLocalDir !== localDir) {
      ConfigBus.persistence = new BusPersistence(localDir)
      ConfigBus.persistenceLocalDir = localDir
    }
    return ConfigBus.persistence
  }

  static addListener(event: ConfigListenerEvent, listener: ((arg: Slave) => void) | ((arg: number) => void)) {
    ConfigBus.listeners.push({ event: event, listener: listener })
  }
  private static emitSlaveEvent(event: ConfigListenerEvent, arg: Slave) {
    ConfigBus.listeners.forEach((eventListener) => {
      if (eventListener.event == event)
        (eventListener.listener as (arg: Slave) => Promise<void>)(arg)
          .then(() => {
            debug('Event listener executed')
          })
          .catch((e) => {
            log.log(LogLevelEnum.error, 'Unable to call event listener: ' + e.message)
          })
    })
  }
  private static emitBusEvent(event: ConfigListenerEvent, arg: number) {
    ConfigBus.listeners.forEach((eventListener) => {
      if (eventListener.event == event) (eventListener.listener as (arg: number) => void)(arg)
    })
  }

  static resetForE2E(): void {
    ConfigBus.busses = []
    ConfigBus.listeners = []
    ConfigBus.persistence = undefined as unknown as BusPersistence
  }

  static getBussesProperties(): IBus[] {
    return ConfigBus.busses
  }

  static readBusses() {
    ConfigBus.busses = []
    const persistence = ConfigBus.ensurePersistence()
    const busData = persistence.readAll()

    busData.forEach((bus) => {
      ConfigBus.busses.push(bus)
      // Resolve references in a separate pass: the slave files are read in directory order, so the
      // referenced slave is not guaranteed to be known while the referencing one is being read.
      bus.slaves.forEach((slave) => {
        if (slave.referenceSlaveId != undefined) ConfigBus.resolveReference(bus, slave)
      })
      bus.slaves.forEach((slave) => {
        ConfigBus.addSpecification(slave)
        ConfigBus.emitSlaveEvent(ConfigListenerEvent.addSlave, new Slave(bus.busId, slave, Config.getConfiguration().mqttbasetopic))
      })
    })

    debug('config: busses.length: ' + ConfigBus.busses.length)
  }

  getInstance(): ConfigBus {
    ConfigBus.busses = ConfigBus.busses && ConfigBus.busses.length > 0 ? ConfigBus.busses : []
    return new ConfigBus()
  }

  static addBusProperties(connection: IModbusConnection): IBus {
    let maxBusId = -1
    ConfigBus.busses.forEach((b) => {
      if (b.busId > maxBusId) maxBusId = b.busId
    })
    maxBusId++
    log.log(LogLevelEnum.info, 'AddBusProperties: ' + maxBusId)
    const busArrayIndex =
      ConfigBus.busses.push({
        busId: maxBusId,
        connectionData: connection,
        slaves: [],
      }) - 1

    ConfigBus.ensurePersistence().writeBus(maxBusId, connection)
    return ConfigBus.busses[busArrayIndex]
  }

  static updateBusProperties(bus: IBus, connection: IModbusConnection): IBus {
    bus.connectionData = connection
    ConfigBus.ensurePersistence().writeBus(bus.busId, connection)
    return bus
  }

  static deleteBusProperties(busid: number) {
    const idx = ConfigBus.busses.findIndex((b) => b.busId == busid)
    if (idx >= 0) {
      ConfigBus.emitBusEvent(ConfigListenerEvent.deleteBus, busid)
      ConfigBus.busses.splice(idx, 1)
      ConfigBus.ensurePersistence().deleteBusDir(busid)
    }
  }

  static async filterAllslaves<T>(busid: number, specFunction: <T>(slave: Islave) => Set<T>): Promise<Set<T>> {
    const addresses = new Set<T>()
    for (const slave of ConfigBus.busses[busid].slaves) {
      for (const addr of specFunction<T>(slave)) addresses.add(addr)
    }
    return addresses
  }

  static getIdentityEntities(spec: Ispecification, language?: string): IidentEntity[] {
    return spec.entities.map((se) => {
      let name: string | undefined = undefined
      if (language) {
        const n = getSpecificationI18nEntityName(spec, language, se.id)
        if (n == null) name = undefined
        else name = n
      }
      return {
        id: se.id,
        readonly: se.readonly,
        name: name,
        mqttname: se.mqttname ? se.mqttname : 'unknown',
      }
    })
  }

  static addSpecification(slave: Islave): void {
    const spec = ConfigSpecification.getSpecificationByFilename(slave.specificationid)
    slave.specification = spec
  }

  /**
   * Copies every inherited field of the referenced (root) slave into the referencing (child) slave,
   * so the rest of the system sees a complete Islave (same idea as addSpecification()). The child's
   * own fields (OWN_SLAVE_FIELDS) survive; anything else it carries is dropped first, so a client
   * cannot smuggle in values that would silently differ from the root.
   *
   * A missing root is tolerated: the child keeps its own fields only, which leaves it without a
   * specification, so it is neither polled nor discovered. That can only happen when the config was
   * hand-edited - the API prevents it (see deleteSlave / slaveRoutes).
   */
  static resolveReference(bus: IBus, slave: Islave): void {
    const root = bus.slaves.find((s) => s.slaveid === slave.referenceSlaveId)
    if (root == undefined) {
      ConfigBus.stripInheritedFields(slave)
      log.log(
        LogLevelEnum.error,
        'Slave ' + slave.slaveid + ' references unknown slave ' + slave.referenceSlaveId + ' on bus ' + bus.busId
      )
      return
    }
    ConfigBus.applyInheritance(root, slave)
  }

  private static stripInheritedFields(slave: Islave): void {
    for (const prop of Object.keys(slave) as (keyof Islave)[]) {
      if (!OWN_SLAVE_FIELDS.includes(prop)) delete slave[prop]
    }
  }

  /** Overwrites all inherited fields of the child with the root's values. */
  private static applyInheritance(root: Islave, child: Islave): void {
    ConfigBus.stripInheritedFields(child)
    for (const prop of Object.keys(root) as (keyof Islave)[]) {
      if (!OWN_SLAVE_FIELDS.includes(prop)) (child as unknown as Record<string, unknown>)[prop] = structuredClone(root[prop])
    }
  }

  /** All slaves of the bus referencing the given slave. Bus local: a reference never crosses a bus. */
  static getReferencingSlaves(busid: number, slaveid: number): Islave[] {
    const bus = ConfigBus.busses.find((b) => b.busId == busid)
    if (bus == undefined) return []
    return bus.slaves.filter((s) => s.referenceSlaveId === slaveid)
  }

  /**
   * Turns a referencing slave into a standalone one: the inherited values (already materialized in
   * memory) become its own and are persisted. Used when the user explicitly detaches a slave, and when
   * a referenced slave is deleted with detachReferences.
   */
  static detachSlave(busid: number, slave: Islave): void {
    delete slave.referenceSlaveId
    ConfigBus.writeslave(busid, slave)
  }

  static writeslave(busid: number, slave: Islave): void {
    const filename = Config.getFileNameFromSlaveId(slave.slaveid)
    const bus = ConfigBus.busses.find((b) => b.busId == busid)

    // A referencing slave takes all inherited values from its root - whatever the caller passed for
    // them is discarded (the persistence layer strips them from the file as well).
    if (bus != undefined && slave.referenceSlaveId != undefined) ConfigBus.resolveReference(bus, slave)

    ConfigBus.ensurePersistence().writeSlave(busid, slave)

    if (slave.specificationid) {
      ConfigBus.addSpecification(slave)
      const o = new Slave(busid, slave, Config.getConfiguration().mqttbasetopic)
      ConfigBus.emitSlaveEvent(ConfigListenerEvent.updateSlave, o)
    } else debug('No Specification found for slave: ' + filename + ' specification: ' + slave.specificationid)

    // The slave just written may be the root of others: re-materialize them and let MQTT discovery
    // know, otherwise they would keep running with the previous configuration. Their files hold only
    // the own fields, so they need no rewrite.
    if (bus == undefined || slave.referenceSlaveId != undefined) return
    for (const child of bus.slaves) {
      if (child.referenceSlaveId !== slave.slaveid || child.slaveid === slave.slaveid) continue
      ConfigBus.applyInheritance(slave, child)
      ConfigBus.addSpecification(child)
      if (child.specificationid)
        ConfigBus.emitSlaveEvent(ConfigListenerEvent.updateSlave, new Slave(busid, child, Config.getConfiguration().mqttbasetopic))
    }
  }

  static getSlave(busid: number, slaveid: number): Islave | undefined {
    if (ConfigBus.busses.length <= busid) {
      debug('Config.getslave: unknown bus')
      return undefined
    }
    const rc = ConfigBus.busses[busid].slaves.find((dev) => {
      return dev.slaveid === slaveid
    })
    if (!rc) debug('slaves.length: ' + ConfigBus.busses[busid].slaves.length)
    for (const dev of ConfigBus.busses[busid].slaves) {
      debug(dev.name)
    }
    return rc
  }
  static getslaveBySlaveId(busid: number, slaveId: number) {
    const rc = ConfigBus.busses[busid].slaves.find((dev) => {
      return dev.slaveid === slaveId
    })
    return rc
  }

  /**
   * The single choke point for deleting a slave (HTTP route, Bus, tests), so this is where the
   * referential invariant belongs: a referenced slave is never deleted silently. Without
   * detachReferences the delete fails; with it, the referencing slaves keep their configuration by
   * becoming standalone slaves (their inherited values are written to their files) before the root
   * goes away. Both paths are explicit - the backend never orphans a slave and never rewrites other
   * slaves unasked.
   */
  static deleteSlave(busid: number, slaveid: number, detachReferences: boolean = false) {
    const referencing = ConfigBus.getReferencingSlaves(busid, slaveid)
    if (referencing.length > 0) {
      if (!detachReferences)
        throw new SlaveReferencedError(
          slaveid,
          referencing.map((s) => s.slaveid)
        )
      for (const child of referencing) ConfigBus.detachSlave(busid, child)
    }
    const bus = ConfigBus.busses.find((bus) => bus.busId == busid)
    if (bus != undefined) {
      debug('DELETE /slave slaveid' + busid + '/' + slaveid + ' number of slaves: ' + bus.slaves.length)
      let found = false
      for (let idx = 0; idx < bus.slaves.length; idx++) {
        const slave = bus.slaves[idx]

        if (slave.slaveid === slaveid) {
          found = true
          ConfigBus.ensurePersistence().deleteSlaveFile(busid, slave)
          ConfigBus.addSpecification(slave)
          const o = new Slave(busid, slave, Config.getConfiguration().mqttbasetopic)
          ConfigBus.emitSlaveEvent(ConfigListenerEvent.deleteSlave, o)
          bus.slaves.splice(idx, 1)
          debug('DELETE /slave finished ' + slaveid + ' number of slaves: ' + bus.slaves.length)
          return
        }
      }
      if (!found) debug('slave not found for deletion ' + slaveid)
    } else {
      const msg = 'Unable to delete slave. Check server log for details'
      log.log(LogLevelEnum.error, msg + ' busid ' + busid + ' not found')

      throw new Error(msg)
    }
  }

  private static listDevicesUdev(next: (devices: string[]) => void, reject: (error: Error) => void): void {
    SerialPort.list()
      .then((portInfo) => {
        const devices: string[] = []
        portInfo.forEach((port) => {
          devices.push(port.path)
        })
        next(devices)
      })

      .catch((error: unknown) => {
        reject(error instanceof Error ? error : new Error(String(error)))
      })
  }

  private static grepDevices(bodyObject: HassioHardwareInfo): string[] {
    const devices = bodyObject.data.devices
    const rc: string[] = []
    devices.forEach((device) => {
      if (device.subsystem === 'tty')
        try {
          fs.accessSync(device.dev_path, fs.constants.R_OK)
          rc.push(device.dev_path)
        } catch (e) {
          log.log(LogLevelEnum.error, 'Permission denied for read serial device %s %s', device.dev_path, String(e))
        }
    })
    return rc
  }
  private static listDevicesHassio(next: (devices: string[]) => void, reject: () => void): void {
    Config.executeHassioGetRequest<HassioHardwareInfo>(
      '/hardware/info',
      (dev) => {
        next(ConfigBus.grepDevices(dev))
      },
      reject
    )
  }

  static listDevices(next: (devices: string[]) => void, reject: () => void): void {
    try {
      ConfigBus.listDevicesHassio(next, () => {
        this.listDevicesUdev(next, reject)
      })
    } catch {
      try {
        this.listDevicesUdev(next, reject)
      } catch {
        next([])
      }
    }
  }
}
