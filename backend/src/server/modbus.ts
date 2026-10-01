import { Ientity, ImodbusEntity, ImodbusSpecification, Ispecification, Icondition, ModbusRegisterType } from '../shared/specification/index.js'
import { ConfigSpecification, ConverterMap, ImodbusValues, IModbusResultOrError, M2mSpecification, emptyModbusValues, entityConditions, isEntityActiveByValues } from '../specification/index.js'
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
    if (entity.modbusAddress && entity.registerType) {
      return modbusAPI.writeModbusRegister(slaveid, entity.modbusAddress, entity.registerType, modbusValue, {
        task: ModbusTasks.writeEntity,
        errorHandling: {},
      })
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
          return modbusAPI.writeModbusRegister(slaveid, entity.modbusAddress, entity.registerType, modbusValue, {
            task: ModbusTasks.writeEntity,
            errorHandling: {},
          })
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
    if (entity && entity.modbusAddress && entity.registerType) {
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
  /**
   * Returns true if the entity is active given the values of its condition register.
   * Entities without a `condition` are always active. Config entities are not read
   * as value registers (they are handled by the config API).
   */
  static isEntityActive(entity: { condition?: { register: number; registerType?: number; bit?: number; comparator?: string; value?: number; values?: number[]; mask?: number }; modbusAddress?: number; category?: string }, value: number | undefined): boolean {
    if (!entity.condition) return true
    if (value === undefined || value === null) return false // condition register not readable -> not active
    const c = entity.condition
    // If a single bit is referenced (register.bit), compare the bit value (0/1).
    let actual = value
    if (c.mask !== undefined && c.mask !== null) actual = value & c.mask
    if (c.bit !== undefined && c.bit !== null) actual = ((value >> c.bit) & 1)
    // OR-set: matches if the (possibly bit-resolved) value is any of `values`.
    if (c.values !== undefined && c.values !== null) return c.values.includes(actual)
    const expected = c.value ?? 0
    const cmp = c.comparator || 'eq'
    switch (cmp) {
      case 'eq': return actual === expected
      case 'ne': return actual !== expected
      case 'lt': return actual < expected
      case 'le': return actual <= expected
      case 'gt': return actual > expected
      case 'ge': return actual >= expected
      case 'contains': return expected !== undefined && ((actual >> Math.trunc(expected)) & 1) === 1
      case 'hasbit': return expected !== undefined && ((actual >> Math.trunc(expected)) & 1) === 1
      default: return actual === expected
    }
  }

  static async getModbusSpecificationFromData(
    task: ModbusTasks,
    modbusAPI: IconsumerModbusAPI,
    slaveid: number,
    specification: IfileSpecification,
    sub: Subject<ImodbusSpecification>
  ): Promise<void> {
    ConfigSpecification.clearModbusData(specification)
    const info = '(' + modbusAPI.getName() + ',' + slaveid + ')'

    // ---- Phase 1: read condition registers (+ all value registers for a single
    // pass when there are no conditional entities) ----
    const conditionAddresses = new Set<ImodbusAddress>()
    const condRegType: Map<number, number> = new Map()
    for (const ent of specification.entities) {
      if (ent.category === 'config') continue // config regs are handled by the config API
      for (const c of entityConditions(ent)) {
        const t = c.registerType ?? EntRegisterType(ent.registerType)
        conditionAddresses.add({ address: c.register, registerType: t })
        if (!condRegType.has(c.register)) condRegType.set(c.register, t)
      }
    }

    // ---- Phase 2: determine active entities, then read only their registers ----
    try {
      // Config entities are read too (so the webui can show their current value),
      // but they are still excluded from the MQTT state payload and HA discovery.
      const activeEntities0 = [...specification.entities]
      let activeEntities = activeEntities0.filter((e) => e.category !== 'config')
      let conditionValues: ImodbusValues | undefined = undefined

      const hasConditional = specification.entities.some((e) => entityConditions(e).length > 0)
      if (hasConditional) {
        // Read the condition registers first.
        conditionValues = await modbusAPI.readModbusRegister(slaveid, conditionAddresses, { task: task, errorHandling: { retry: true } })
        // Mark inactive entities: keep them out of the address read but still report
        // them (not identified) so the UI can hide them in the device view.
        activeEntities = activeEntities.filter((e) => {
          const conds = entityConditions(e)
          if (conds.length === 0) return true
          // If any condition register is not readable, keep the entity (best effort) -
          // an unknown condition should not hide a possibly-present sensor.
          for (const c of conds) {
            const t = c.registerType ?? EntRegisterType(e.registerType)
            const val = getRegValue(conditionValues!, t, c.register)
            if (val === undefined) return true
          }
          return isEntityActiveByValues(e, conditionValues!)
        })
      }

      const addresses = new Set<ImodbusAddress>()
      const addEntityAddresses = (ent: Ientity) => {
        const converter = ConverterMap.getConverter(ent)
        if (ent.modbusAddress != undefined && converter && ent.registerType)
          for (let i = 0; i < converter.getModbusLength(ent); i++) {
            addresses.add({ address: ent.modbusAddress + i, registerType: ent.registerType })
          }
      }
      for (const ent of activeEntities) addEntityAddresses(ent)
      // Config registers carry no conditions and are always read: they keep their
      // value in the spec so the webui can display them (they are still excluded
      // from the MQTT state payload and HA discovery).
      for (const ent of specification.entities) {
        if (ent.category === 'config') addEntityAddresses(ent)
      }

      debugAction('getModbusSpecificationFromData start read from modbus')
      const values = await modbusAPI.readModbusRegister(slaveid, addresses, { task: task, errorHandling: { retry: true } })
      debugAction('getModbusSpecificationFromData end read from modbus')

      // Mark inactive conditional entities so they are reported as not-identified / empty.
      const finalValues = values
      // Make the condition registers available for per-entity active evaluation:
      // the condition phase read them into a separate object, so merge them into
      // the final values map (they are address-keyed and do not clash with reads).
      if (conditionValues) {
        const merge = (src: Map<number, IModbusResultOrError>, dst: Map<number, IModbusResultOrError>) => {
          src.forEach((v, k) => { if (!dst.has(k)) dst.set(k, v) })
        }
        merge(conditionValues.holdingRegisters, finalValues.holdingRegisters)
        merge(conditionValues.analogInputs, finalValues.analogInputs)
        merge(conditionValues.coils, finalValues.coils)
        merge(conditionValues.discreteInputs, finalValues.discreteInputs)
      }
      if (hasConditional && conditionValues) {
        // Build the set of (address, registerType) actually read for ACTIVE entities.
        // When two conditional variants share the same register (e.g. register 0 is
        // temperature in SI and a different mapping in Imperial, selected by another
        // register such as 400), the inactive variant must NOT delete the shared
        // address, or the active variant would have no data.
        const activeAddressKeys = new Set<string>()
        for (const ent of specification.entities) {
          const e = ent as ImodbusEntityLike
          if (e.modbusAddress === undefined || !ent.registerType) continue
          if (ent.category === 'config') continue
          if (entityConditions(ent).length > 0) {
            if (!isEntityActiveByValues(ent, finalValues)) continue
          }
          const converter = ConverterMap.getConverter(ent)
          const length = converter ? converter.getModbusLength(ent) : 1
          for (let i = 0; i < length; i++) {
            activeAddressKeys.add(e.modbusAddress + i + '|' + ent.registerType)
          }
        }
        for (const ent of specification.entities) {
          if (entityConditions(ent).length === 0) continue
          if (isEntityActiveByValues(ent, finalValues)) continue
          {
            // Remove the entity's full register span (a 32-bit entity covers two registers),
            // but only if no ACTIVE entity reads the same span - otherwise the active
            // variant loses its value.
            const e = ent as ImodbusEntityLike
            if (e.modbusAddress !== undefined) {
              const converter = ConverterMap.getConverter(ent)
              const length = converter ? converter.getModbusLength(ent) : 1
              const spansShared = (() => {
                for (let i = 0; i < length; i++) {
                  if (activeAddressKeys.has(e.modbusAddress + i + '|' + ent.registerType)) return true
                }
                return false
              })()
              if (spansShared) continue // an active variant needs this address - keep the data
              for (let i = 0; i < length; i++) {
                finalValues.holdingRegisters.delete(e.modbusAddress + i)
                finalValues.analogInputs.delete(e.modbusAddress + i)
                finalValues.coils.delete(e.modbusAddress + i)
                finalValues.discreteInputs.delete(e.modbusAddress + i)
              }
            }
          }
        }
      }
      Modbus.populateEntitiesForSpecification(specification!, finalValues, sub)
    } catch (e: any) {
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

interface ImodbusEntityLike {
  modbusAddress?: number
  condition?: { register: number; registerType?: number; bits?: number[]; equals?: number }
}
function EntRegisterType(rt: number): number {
  return rt
}
function getRegValue(v: ImodbusValues, registerType: number, address: number): number | undefined {
  let value: { data?: number[] } | undefined
  switch (registerType) {
    case 4: value = v.analogInputs.get(address); break
    case 3: value = v.holdingRegisters.get(address); break
    case 1: value = v.coils.get(address); break
    default: value = v.discreteInputs.get(address); break
  }
  return value && value.data && value.data.length ? value.data[0] : undefined
}

export class ModbusForTest extends Modbus {
  modbusDataToSpecForTest(spec: IfileSpecification): ImodbusSpecification | undefined {
    return M2mSpecification.fileToModbusSpecification(spec)
  }
}
