import Debug from 'debug'
import {
  getSpecificationI18nName,
  ImodbusEntity,
  ImodbusSpecification,
  SpecificationStatus,
} from '../shared/specification/index.js'
import { ImodbusAddress, ModbusTasks } from '../shared/server/index.js'
import { IdentifiedStates } from '../shared/specification/index.js'
import { ConverterMap, ImodbusValues, M2mSpecification } from '../specification/index.js'
import { ConfigBus } from './configbus.js'
import * as fs from 'fs'
import { IfileSpecification } from '../specification/index.js'
import { LogLevelEnum, Logger } from '../specification/index.js'
import {
  Islave,
  IModbusConnection,
  IBus,
  IRTUConnection,
  ITCPConnection,
  IidentificationSpecification,
} from '../shared/server/index.js'
import { ConfigSpecification } from '../specification/index.js'
import { ModbusTcpRtuBridge } from './tcprtubridge.js'
import { MqttPoller } from './mqttpoller.js'
import { MqttConnector } from './mqttconnector.js'
import { Config } from './config.js'
import { IconsumerModbusAPI, IModbusConfiguration, ModbusAPI } from './modbusAPI.js'
const debug = Debug('bus')
const log = new Logger('bus')
export interface IModbusResultWithDuration {
  data: number[]
  duration?: number
}
export class Bus implements IModbusConfiguration {
  private static busses: Bus[] | undefined = undefined
  private static allSpecificationsModbusAddresses: Set<ImodbusAddress> | undefined = undefined
  static stopBridgeServers(): void {
    Bus.getBusses().forEach((bus) => {
      if (bus.tcprtuBridge) bus.tcprtuBridge.stopServer()
    })
  }
  static readBussesFromConfig(): Promise<PromiseSettledResult<void>[]> {
    const promisses: Promise<void>[] = []
    const ibs = ConfigBus.getBussesProperties()
    if (!Bus.busses) Bus.busses = []
    ibs.forEach((ib) => {
      const bus = Bus.busses!.find((bus) => bus.getId() == ib.busId)
      if (bus !== undefined) bus.properties = ib
      else {
        const b = new Bus(ib)
        promisses.push(b.modbusAPI.initialConnect())
        b.getSlaves().forEach((s) => {
          s.evalTimeout = true
        })
        Bus.busses!.push(b)
      }
    })
    // delete removed busses
    for (let idx = 0; idx < Bus.busses!.length; idx++) {
      if (!ibs.find((ib) => ib.busId == Bus.busses![idx].properties.busId)) Bus.busses!.splice(idx, 1)
    }
    return Promise.allSettled(promisses)
  }
  getName(): string {
    const rtu = this.properties.connectionData as IRTUConnection
    const tcp = this.properties.connectionData as ITCPConnection
    if (undefined != rtu.serialport) return rtu.serialport
    if (undefined != tcp.host) return tcp.host + ':' + tcp.port
    return 'unknown'
  }
  static getBusses(): Bus[] {
    //if (!Bus.busses || Bus.busses.length != ConfigBus.getBussesProperties().length) {
    //  Bus.readBussesFromConfig()
    //}
    //debug("getBusses Number of busses:" + Bus.busses!.length)
    return Bus.busses!
  }
  static addBus(connection: IModbusConnection): Promise<Bus> {
    return new Promise<Bus>((resolve, reject) => {
      debug('addBus()')
      const busP = ConfigBus.addBusProperties(connection)
      const b = Bus.getBusses().find((b) => b.getId() == busP.busId)
      if (b == undefined)
        Bus.readBussesFromConfig()
          .then(() => {
            const b = Bus.getBusses().find((b) => b.getId() == busP.busId)
            if (b != undefined)
              b.modbusAPI
                .initialConnect()
                .then(() => {
                  resolve(b!)
                })
                .catch(reject)
          })
          .catch(reject)
      else
        b.modbusAPI
          .initialConnect()
          .then(() => {
            resolve(b!)
          })
          .catch(reject)
    })
  }

  private connectionChanged(connection: IModbusConnection): boolean {
    const rtu = this.properties.connectionData as IRTUConnection
    if (rtu.serialport) {
      const connectionRtu = connection as IRTUConnection
      if (!connectionRtu.serialport || connectionRtu.serialport !== rtu.serialport) return true
      if (!connectionRtu.baudrate || connectionRtu.baudrate !== rtu.baudrate) return true
      if (!connectionRtu.timeout || connectionRtu.timeout !== rtu.timeout) return true
      if (connectionRtu.tcpBridgePort !== rtu.tcpBridgePort) return true
      return false
    } else {
      const tcp = this.properties.connectionData as ITCPConnection
      const connectionTcp = connection as ITCPConnection
      if (!connectionTcp.host || connectionTcp.host !== tcp.host) return true
      if (!connectionTcp.port || connectionTcp.port !== tcp.port) return true
      if (!connectionTcp.timeout || connectionTcp.timeout !== tcp.timeout) return true
      return false
    }
  }
  private startTcpRtuBridge(port: number) {
    this.tcprtuBridge = new ModbusTcpRtuBridge(this.modbusAPI.getQueue())
    this.tcprtuBridge.startServer(port).catch((e) => {
      log.log(LogLevelEnum.error, 'Unable to start Server : ' + e.message)
    })
  }

  updateBus(connection: IModbusConnection): Promise<Bus> {
    return new Promise<Bus>((resolve, reject) => {
      debug('updateBus()')
      if (this.connectionChanged(connection)) {
        const fct = () => {
          const rtuConnection = connection as IRTUConnection
          if (rtuConnection.serialport && typeof rtuConnection.tcpBridgePort === 'number') {
            this.startTcpRtuBridge(rtuConnection.tcpBridgePort)
          }
        }
        if (this.tcprtuBridge && this.tcprtuBridge.serverTCP) this.tcprtuBridge.stopServer(fct)
        else fct()

        const busP = ConfigBus.updateBusProperties(this.properties, connection)
        const b = Bus.getBusses().find((b) => b.getId() == busP.busId)
        if (b) {
          b.properties = busP
          // Change of bus properties can influence the modbus data
          // E.g. set of lower timeout can lead to error messages
          b.modbusAPI
            .reconnectRTU('updateBus')
            .then(() => {
              resolve(b!)
            })
            .catch(reject)
        } else reject('Bus does not exist')
      } else resolve(this)
    })
  }
  static deleteBus(busid: number) {
    const idx = Bus.getBusses().findIndex((b) => b.properties.busId == busid)
    if (idx >= 0) {
      Bus.getBusses().splice(idx, 1)
      ConfigBus.deleteBusProperties(busid)
    }
  }
  static getBus(busid: number): Bus | undefined {
    // debug("getBus()")
    if (Bus.getBusses() == undefined) return undefined
    return Bus.getBusses().find((b) => b.properties.busId == busid)
  }

  properties: IBus
  private tcprtuBridge: ModbusTcpRtuBridge | undefined
  private modbusAPI: ModbusAPI
  constructor(ibus: IBus) {
    this.properties = ibus
    this.modbusAPI = new ModbusAPI(this)
    const rtuConnection = ibus.connectionData as IRTUConnection
    if (rtuConnection.serialport && typeof rtuConnection.tcpBridgePort === 'number') {
      this.startTcpRtuBridge(rtuConnection.tcpBridgePort)
    }
  }
  getModbusAPI(): IconsumerModbusAPI {
    return this.modbusAPI
  }
  getSlaveTimeoutBySlaveId(slaveid: number): number {
    const slave = this.getSlaveBySlaveId(slaveid)
    if (slave) if (slave.modbusTimout != undefined) return slave.modbusTimout
    return this.properties.connectionData.timeout
  }
  getModbusConnection(): IModbusConnection {
    return this.properties.connectionData
  }
  getId(): number {
    return this.properties.busId
  }
  deleteSlave(slaveid: number, detachReferences: boolean = false) {
    ConfigBus.deleteSlave(this.properties.busId, slaveid, detachReferences)
  }
  static getModbusAddressesForSpec(spec: IfileSpecification, addresses: Set<ImodbusAddress>): void {
    for (const ent of spec.entities) {
      const converter = ConverterMap.getConverter(ent)
      if (ent.modbusAddress != undefined && converter && ent.registerType)
        for (let i = 0; i < converter.getModbusLength(ent); i++) {
          addresses.add({
            address: ent.modbusAddress + i,
            registerType: ent.registerType,
          })
        }
    }
  }
  private static updateAllSpecificationsModbusAddresses(specificationid: string | null) {
    // If a used specificationid was deleted, remove it from slaves
    if (specificationid != null) {
      new ConfigSpecification().filterAllSpecifications((spec) => {
        if (spec.filename == specificationid) specificationid = null
      })
      Bus.getBusses().forEach((bus) => {
        bus.getSlaves().forEach((slave) => {
          debug('updateAllSpecificationsModbusAddresses slaveid: ' + slave.slaveid)
          // A referencing slave has no specificationid of its own: it follows the slave it references,
          // which is updated by its own iteration here.
          if (slave.referenceSlaveId != undefined) return
          if (specificationid == null) slave.specificationid = undefined
          else slave.specificationid = specificationid
          if (slave.specificationid == specificationid) ConfigBus.writeslave(bus.getId(), slave)
        })
      })
    }
    Bus.allSpecificationsModbusAddresses = new Set<ImodbusAddress>()
    new ConfigSpecification().filterAllSpecifications((spec) => {
      Bus.getModbusAddressesForSpec(spec, Bus.allSpecificationsModbusAddresses!)
    })
  }
  /*
   * returns cached set of all modbusaddresses for all specifications.
   * It will be updated after any change to Config.specifications array
   */
  private static getModbusAddressesForAllSpecs(): Set<ImodbusAddress> {
    debug('getAllModbusAddresses')
    if (!Bus.allSpecificationsModbusAddresses) {
      Bus.updateAllSpecificationsModbusAddresses(null)
      // Config.getSpecificationsChangedObservable().subscribe(Bus.updateAllSpecificationsModbusAddresses)
    }
    return Bus.allSpecificationsModbusAddresses!
  }

  /*
   * getAvailableSpecs uses bus.slaves cache if possible
   */
  getAvailableSpecs(slaveid: number, showAllPublicSpecs: boolean, language: string): Promise<IidentificationSpecification[]> {
    return new Promise<IidentificationSpecification[]>((resolve, reject) => {
      const addresses = Bus.getModbusAddressesForAllSpecs()

      const rcf = (ispecs: IidentificationSpecification[], modbusData: ImodbusValues): void => {
        const slave = this.getSlaveBySlaveId(slaveid)
        const cfg = new ConfigSpecification()
        cfg.filterAllSpecifications((spec) => {
          const mspec = M2mSpecification.fileToModbusSpecification(spec, modbusData)
          debug('getAvailableSpecs')
          if (mspec) {
            // list only identified public specs, but all local specs
            // Make sure the current configured specification is in the list
            if (
              [SpecificationStatus.published, SpecificationStatus.contributed].includes(mspec.status) &&
              (showAllPublicSpecs ||
                (slave && slave.specificationid == mspec.filename) ||
                mspec.identified == IdentifiedStates.identified)
            )
              iSpecs.push(this.convert2IidentificationSpecification(slaveid, mspec, language))
            else if (![SpecificationStatus.published, SpecificationStatus.contributed].includes(mspec.status))
              iSpecs.push(this.convert2IidentificationSpecification(slaveid, mspec, language))
          } else if (
            ![SpecificationStatus.published, SpecificationStatus.contributed].includes(spec.status) ||
            (slave && slave.specificationid == spec.filename)
          )
            iSpecs.push(this.convert2IidentificationSpecificationFromSpec(slaveid, spec, language, IdentifiedStates.notIdentified))
        })
      }
      const iSpecs: IidentificationSpecification[] = []
      // no result in cache, read from modbus
      // will be called once (per slave)
      const usbPort = (this.properties.connectionData as IRTUConnection).serialport
      if (!Config.getConfiguration().fakeModbus) {
        if (usbPort && !fs.existsSync(usbPort)) {
          reject(new Error('RTU is configured, but device is not available'))
          return
        }
      }
      this.modbusAPI
        .readModbusRegister(slaveid, addresses, {
          task: ModbusTasks.deviceDetection,
          printLogs: false,
          errorHandling: { split: true },
          useCache: true,
        })
        .then((values) => {
          // Add not available addresses to the values
          // Store it for cache
          rcf(iSpecs, values)
          resolve(iSpecs)
        })
        .catch(reject)
    })
  }

  private convert2IidentificationSpecification(
    slaveid: number,
    mspec: ImodbusSpecification,
    language: string
  ): IidentificationSpecification {
    // for each spec
    const entityIdentifications: ImodbusEntity[] = []
    for (const ment of mspec.entities) {
      entityIdentifications.push(ment)
    }
    let name: string | undefined | null = getSpecificationI18nName(mspec, language)
    if (name == null) name = undefined
    return {
      filename: mspec.filename,
      name: name,
      status: mspec.status!,
      identified: mspec.identified,
      entities: ConfigBus.getIdentityEntities(mspec, language),
    }
  }
  private convert2IidentificationSpecificationFromSpec(
    slaveid: number,
    spec: IfileSpecification,
    language: string,
    identified: IdentifiedStates
  ): IidentificationSpecification {
    // for each spec
    let name: string | undefined | null = getSpecificationI18nName(spec, language)
    if (name == null) name = undefined
    return {
      filename: spec.filename,
      name: name,
      identified: identified,
      status: spec.status!,
      entities: ConfigBus.getIdentityEntities(spec, language),
    }
  }

  writeSlave(slave: Islave): Islave {
    if (slave.slaveid < 0) throw new Error('Try to save invalid slave id ') // Make sure slaveid is unique
    const oldIdx = this.properties.slaves.findIndex((dev) => {
      return dev.slaveid === slave.slaveid
    })
    ConfigBus.writeslave(this.properties.busId, slave)

    if (oldIdx >= 0) this.properties.slaves[oldIdx] = slave
    else this.properties.slaves.push(slave)
    return slave
  }

  private getISlave(properties: Islave): Islave {
    if (properties && properties.specificationid) {
      const spec = ConfigSpecification.getSpecificationByFilename(properties.specificationid)
      if (spec) {
        properties.specification = spec
      }
      properties.modbusStatusForSlave = this.modbusAPI.getErrors(properties.slaveid)
    }
    return properties
  }
  getSlaves(): Islave[] {
    return this.properties.slaves
  }
  getSlaveBySlaveId(slaveid: number | undefined): Islave | undefined {
    let slave = this.properties.slaves.find((dev) => dev.slaveid == slaveid)
    if (slave) slave = this.getISlave(slave)
    return slave
  }
  public static cleanupCaches() {
    Bus.getBusses().forEach((bus) => bus.modbusAPI.cleanupCache())
  }
  private poller?: MqttPoller

  startPolling() {
    this.poller = new MqttPoller(MqttConnector.getInstance())
    this.poller.startPolling(this)
  }

  stopPolling(): void {
    if (this.poller) {
      this.poller.stopPolling()
      this.poller = undefined
    }
  }

  static resetForE2E(): void {
    if (Bus.busses) {
      Bus.busses.forEach((bus) => {
        bus.stopPolling()
        if (bus.tcprtuBridge) bus.tcprtuBridge.stopServer()
      })
    }
    Bus.busses = []
    Bus.allSpecificationsModbusAddresses = undefined
  }
}
