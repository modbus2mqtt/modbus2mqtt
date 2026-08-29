import { ImodbusSpecification, Ispecification } from '../shared/specification/index.js'
import { ConfigSpecification, ConverterMap, ImodbusValues, M2mSpecification, emptyModbusValues } from '../specification/index.js'
import { Ientity, ImodbusEntity } from '../shared/specification/index.js'
import { Config } from './config.js'
import { Observable, Subject } from 'rxjs'
import { Bus } from './bus.js'
import { submitGetHoldingRegisterRequest } from './submitRequestMock.js'
import { IfileSpecification } from '../specification/index.js'
import { LogLevelEnum, Logger } from '../specification/index.js'
import { ImodbusAddress, Islave, ModbusTasks } from '../shared/server/index.js'
import { IconsumerModbusAPI } from './modbusAPI.js'
import Debug from 'debug'
const debug = Debug('modbus')

const debugAction = Debug('actions')

const log = new Logger('modbus')
export class Modbus {
  constructor() {}

  static writeEntityModbus(modbusAPI: IconsumerModbusAPI, slaveid: number, entity: Ientity, modbusValue: number[]): Promise<void> {
    if (entity.modbusAddress !== undefined && entity.modbusAddress !== null && entity.registerType) {
      return modbusAPI.writeModbusRegister(
        slaveid,
        entity.modbusAddress,
        entity.registerType,
        modbusValue,
        {
          task: ModbusTasks.writeEntity,
          errorHandling: {},
        },
        entity.writeFunctionCode
      )
    }
    throw new Error('No modbusaddress or registerType passed')
  }

  static writeEntityMqtt(
    modbusAPI: IconsumerModbusAPI,
    slaveid: number,
    spec: Ispecification,
    entityid: number,
    mqttValue: string
  ): Promise<void> {
    // this.modbusClient.setID(device.slaveid);
    const entity = spec.entities.find((ent) => ent.id == entityid)
    if (Config.getConfiguration().fakeModbus) {
      return new Promise<void>((resolve) => {
        debug('Fake ModbusWrite')
        resolve()
      })
    } else if (entity) {
      const converter = ConverterMap.getConverter(entity)
      if (entity.modbusAddress !== undefined && entity.registerType && converter) {
        const modbusValue = converter?.mqtt2modbus(spec, entityid, mqttValue)
        if (modbusValue && modbusValue.length > 0) {
          return modbusAPI.writeModbusRegister(
            slaveid,
            entity.modbusAddress,
            entity.registerType,
            modbusValue,
            {
              task: ModbusTasks.writeEntity,
              errorHandling: {},
            },
            entity.writeFunctionCode
          )
          // TODO:Migrate converter
        } else throw new Error('No modbus address or function code or converter not found for entity ' + entityid + ' ')
      } else throw new Error('No modbus address or function code for entity ' + entityid + ' ')
    } else throw new Error('Entity not found in Specification entityid: ' + entityid + JSON.stringify(spec))
  }

  async readEntityFromModbus(
    modbusAPI: IconsumerModbusAPI,
    slaveid: number,
    spec: Ispecification,
    entityId: number
  ): Promise<ImodbusEntity> {
    const entity = spec.entities.find((ent) => ent.id == entityId)
    if (entity && entity.modbusAddress !== undefined && entity.modbusAddress !== null && entity.registerType) {
      const converter = ConverterMap.getConverter(entity)
      if (converter) {
        const addresses = new Set<ImodbusAddress>()
        for (let i = entity.modbusAddress; i < entity.modbusAddress + converter.getModbusLength(entity); i++)
          addresses.add({ address: i, registerType: entity.registerType })

        const results = Config.getConfiguration().fakeModbus
          ? await submitGetHoldingRegisterRequest(slaveid, addresses)
          : await modbusAPI.readModbusRegister(slaveid, addresses, { task: ModbusTasks.entity, errorHandling: { retry: true } })

        const em = M2mSpecification.copyModbusDataToEntity(spec, entity.id, results)
        if (em) return em
        throw new Error('Unable to copy ModbusData to Entity')
      }
    }
    const msg = 'Bus ' + modbusAPI.getName() + ' has no configured Specification'
    log.log(LogLevelEnum.info, msg)
    throw new Error(msg)
  }

  /*
   * iterates over slave ids starting at slaveid = 1. If one of the holding registers 0,1,2 or 3 returns a value, the slave id is considered to have an attached device.
   * Now, the method tries to find specifications which are supported by the device.
   * So, even if a device was not recognized, but the modbus registers of all identifying entities are available, the slaveId will be considered to hava an attached device.
   * The result, contains an array of all slaveids with an attached device.
   * Additionally it contains an array of public specifications matching the modbus registers of the device plus all local specifications.
   */

  private static populateEntitiesForSpecification(
    specification: IfileSpecification,
    values: ImodbusValues,
    sub: Subject<ImodbusSpecification>
  ) {
    const mspec = M2mSpecification.fileToModbusSpecification(specification!, values)
    if (mspec) sub.next(mspec)
  }
  static async getModbusSpecificationFromData(
    task: ModbusTasks,
    modbusAPI: IconsumerModbusAPI,
    slaveid: number,
    specification: IfileSpecification,
    sub: Subject<ImodbusSpecification>
  ): Promise<void> {
    const addresses = new Set<ImodbusAddress>()
    ConfigSpecification.clearModbusData(specification)
    const info = '(' + modbusAPI.getName() + ',' + slaveid + ')'
    Bus.getModbusAddressesForSpec(specification, addresses)

    debugAction('getModbusSpecificationFromData start read from modbus')
    try {
      const values = await modbusAPI.readModbusRegister(slaveid, addresses, { task: task, errorHandling: { retry: true } })
      debugAction('getModbusSpecificationFromData end read from modbus')
      Modbus.populateEntitiesForSpecification(specification!, values, sub)
    } catch (e: any) {
      // read modbus data failed.
      log.log(LogLevelEnum.error, 'Modbus Read ' + info + ' failed: ' + e.message)
      Modbus.populateEntitiesForSpecification(specification!, emptyModbusValues(), sub)
    }
  }
  static getModbusSpecification(
    task: ModbusTasks,
    modbusAPI: IconsumerModbusAPI,
    slave: Islave,
    specificationFilename: string | undefined,
    failedFunction: (e: unknown) => void
  ): Observable<ImodbusSpecification> {
    debugAction('getModbusSpecification starts (' + modbusAPI.getName() + ',' + slave.slaveid + ')')
    const rc = new Subject<ImodbusSpecification>()
    if (!specificationFilename || specificationFilename.length == 0) {
      if (slave && slave.specificationid && slave.specificationid.length > 0) specificationFilename = slave.specificationid
    }
    if (specificationFilename) {
      const spec = ConfigSpecification.getSpecificationByFilename(specificationFilename)
      if (spec) {
        Modbus.getModbusSpecificationFromData(task, modbusAPI, slave.slaveid, spec, rc)
      } else {
        const msg = 'Specification not found: ' + specificationFilename
        failedFunction(new Error(msg))
      }
    } else {
      const msg = 'No specification passed to  getModbusSpecification'
      debug(msg)
      failedFunction(new Error(msg))
    }
    return rc
  }
}

export class ModbusForTest extends Modbus {
  modbusDataToSpecForTest(spec: IfileSpecification): ImodbusSpecification | undefined {
    return M2mSpecification.fileToModbusSpecification(spec)
  }
}
