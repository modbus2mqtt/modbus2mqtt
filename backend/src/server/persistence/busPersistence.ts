import { parse, stringify } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import Debug from 'debug'
import { IBus, IModbusConnection, Islave, OWN_SLAVE_FIELDS } from '../../shared/server/index.js'
import { ICollectionPersistence } from './persistence.js'

const debug = Debug('busPersistence')

export class BusPersistence implements ICollectionPersistence<IBus> {
  constructor(private localDir: string) {}

  readAll(): IBus[] {
    const busses: IBus[] = []
    const busDir = join(this.localDir, 'busses')
    if (!fs.existsSync(busDir)) {
      return busses
    }

    const busDirs: fs.Dirent[] = fs.readdirSync(busDir, { withFileTypes: true })
    busDirs.forEach((de) => {
      if (de.isDirectory() && de.name.startsWith('bus.')) {
        const busid = Number.parseInt(de.name.substring(4))
        const busYaml = join(busDir, de.name, 'bus.yaml')
        if (fs.existsSync(busYaml)) {
          const src: string = fs.readFileSync(busYaml, { encoding: 'utf8' })
          try {
            const connectionData: IModbusConnection = parse(src)
            const bus: IBus = {
              busId: busid,
              connectionData: connectionData,
              slaves: [],
            }

            const devFiles: string[] = fs.readdirSync(join(busDir, de.name))
            devFiles.forEach((file: string) => {
              if (file.endsWith('.yaml') && file !== 'bus.yaml') {
                const slaveSrc: string = fs.readFileSync(join(busDir, de.name, file), { encoding: 'utf8' })
                const o: Islave = parse(slaveSrc)
                // A referencing slave has no specificationid of its own - it inherits it from the
                // slave it references (resolved by ConfigBus.readBusses once all slaves are known).
                if ((o.specificationid && o.specificationid.length) || o.referenceSlaveId != undefined) {
                  bus.slaves.push(o)
                }
              }
            })

            bus.slaves.sort((a, b) => a.slaveid - b.slaveid)

            busses.push(bus)
          } catch (e: unknown) {
            if (e instanceof Error) {
              debug('Unable to parse bus or slave file: ' + busYaml + ' error:' + e.message)
            }
          }
        }
      }
    })

    debug('readAll: busses.length: ' + busses.length)
    return busses
  }

  writeItem(key: string, item: IBus): void {
    this.writeBus(item.busId, item.connectionData)
  }

  writeBus(busId: number, connection: IModbusConnection): void {
    const busDir = join(this.localDir, 'busses', 'bus.' + busId)
    if (!fs.existsSync(busDir)) {
      fs.mkdirSync(busDir, { recursive: true })
      debug('creating bus path: ' + busDir)
    }
    const src = stringify(connection)
    fs.writeFileSync(join(busDir, 'bus.yaml'), src, { encoding: 'utf8' })
  }

  writeSlave(busId: number, slave: Islave): void {
    const filePath = this.getSlavePath(busId, slave)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch (e) {
        debug('Unable to create directory ' + dir + ' ' + e)
        throw e
      }
    }

    const o = structuredClone(slave)
    const deletables: string[] = [
      'specification',
      'durationOfLongestModbusCall',
      'triggerPollTopic',
      'modbusErrorStatistic',
      'modbusStatusForSlave',
    ]
    for (const prop in o) {
      if (Object.prototype.hasOwnProperty.call(o, prop)) {
        if (deletables.includes(prop)) delete (o as never)[prop]
      }
    }
    // A referencing slave stores its own fields only. The inherited ones live in the referenced
    // slave's file - persisting them here would freeze a copy that stops following the root.
    if (o.referenceSlaveId != undefined) {
      for (const prop of Object.keys(o) as (keyof Islave)[]) {
        if (!OWN_SLAVE_FIELDS.includes(prop)) delete o[prop]
      }
    }
    if (o.noDiscovery != undefined && o.noDiscovery == false) delete o['noDiscovery']
    if (o.noDiscoverEntities != undefined && o.noDiscoverEntities.length == 0) delete o['noDiscoverEntities']

    const s = stringify(o)
    fs.writeFileSync(filePath, s, { encoding: 'utf8' })
  }

  deleteItem(key: string): void {
    this.deleteBusDir(parseInt(key))
  }

  deleteBusDir(busId: number): void {
    const busDir = join(this.localDir, 'busses', 'bus.' + busId)
    if (fs.existsSync(busDir)) {
      fs.rmSync(busDir, { recursive: true })
    }
  }

  deleteSlaveFile(busId: number, slave: Islave): void {
    const slavePath = this.getSlavePath(busId, slave)
    if (fs.existsSync(slavePath)) {
      // Synchronous like every other write in this class: the caller (ConfigBus.deleteSlave) removes
      // the slave from memory and emits the delete event right after, so the file must be gone by then.
      try {
        fs.unlinkSync(slavePath)
      } catch (e) {
        debug(e)
      }
    }
  }

  private getSlavePath(busId: number, slave: Islave): string {
    return join(this.localDir, 'busses', 'bus.' + busId, 's' + slave.slaveid + '.yaml')
  }
}
