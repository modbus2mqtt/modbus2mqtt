import { Idata, IfileSpecification } from './ifilespecification.js'
import {
  IdentifiedStates,
  IminMax,
  ImodbusEntity,
  ImodbusSpecification,
  Inumber,
  Iselect,
  Ispecification,
  Itext,
  ModbusRegisterType,
} from '../shared/specification/index.js'
import { ConfigSpecification } from './configspec.js'
import { ConverterMap } from './convertermap.js'
import { LogLevelEnum, Logger } from './log.js'

const log = new Logger('m2mSpecification')

export interface IModbusResultOrError {
  data?: number[]
  error?: Error
}
export interface ImodbusValues {
  holdingRegisters: Map<number, IModbusResultOrError>
  analogInputs: Map<number, IModbusResultOrError>
  coils: Map<number, IModbusResultOrError>
  discreteInputs: Map<number, IModbusResultOrError>
}
export function emptyModbusValues(): ImodbusValues {
  return {
    holdingRegisters: new Map<number, IModbusResultOrError>(),
    coils: new Map<number, IModbusResultOrError>(),
    analogInputs: new Map<number, IModbusResultOrError>(),
    discreteInputs: new Map<number, IModbusResultOrError>(),
  }
}

export function setIdentifiedByEntities(mSpec: ImodbusSpecification): void {
  mSpec.identified = IdentifiedStates.unknown
  mSpec.entities.forEach((ent) => {
    switch (ent.identified) {
      case IdentifiedStates.notIdentified:
        mSpec.identified = IdentifiedStates.notIdentified
        break
      case IdentifiedStates.identified:
        if (mSpec.identified == undefined || mSpec.identified == IdentifiedStates.unknown)
          mSpec.identified = IdentifiedStates.identified
        break
    }
  })
}

export function copyFromTestData(testdata: Idata[] | undefined, data: Map<number, IModbusResultOrError>): void {
  if (testdata)
    testdata.forEach((mv) => {
      if (mv.value != undefined)
        data.set(mv.address, {
          data: [mv.value],
          error: mv.error ? new Error(mv.error) : undefined,
        })
      else data.set(mv.address, { error: mv.error ? new Error(mv.error) : undefined })
    })
}

export function fileToModbusSpecification(inSpec: IfileSpecification, values?: ImodbusValues): ImodbusSpecification {
  let valuesLocal = values
  if (valuesLocal == undefined) {
    valuesLocal = emptyModbusValues()
  }
  ConfigSpecification.clearModbusData(inSpec)
  // copy from test data if there are no values passed
  if (
    values == undefined &&
    inSpec.testdata &&
    ((inSpec.testdata.analogInputs && inSpec.testdata.analogInputs.length > 0) ||
      (inSpec.testdata.holdingRegisters && inSpec.testdata.holdingRegisters.length > 0) ||
      (inSpec.testdata.coils && inSpec.testdata.coils.length > 0) ||
      (inSpec.testdata.discreteInputs && inSpec.testdata.discreteInputs.length > 0))
  ) {
    copyFromTestData(inSpec.testdata.holdingRegisters, valuesLocal.holdingRegisters)
    copyFromTestData(inSpec.testdata.analogInputs, valuesLocal.analogInputs)
    copyFromTestData(inSpec.testdata.coils, valuesLocal.coils)
    copyFromTestData(inSpec.testdata.discreteInputs, valuesLocal.discreteInputs)
  }

  const rc: ImodbusSpecification = Object.assign(inSpec)
  for (let entityIndex = 0; entityIndex < inSpec.entities.length; entityIndex++) {
    const entity = rc.entities[entityIndex]
    if (entity.modbusAddress != undefined && entity.registerType) {
      const sm = copyModbusDataToEntity(rc, entity.id, valuesLocal)
      if (sm) {
        rc.entities[entityIndex] = sm
      }
    }
  }
  setIdentifiedByEntities(rc)

  return rc
}

export function copyModbusDataToEntity(spec: Ispecification, entityId: number, values: ImodbusValues): ImodbusEntity {
  const entity = spec.entities.find((ent) => entityId == ent.id)
  if (entity) {
    const rc: ImodbusEntity = structuredClone(entity) as ImodbusEntity
    const converter = ConverterMap.getConverter(entity)
    if (converter) {
      if (entity.modbusAddress != undefined) {
        try {
          let data: number[] = []
          for (let address = entity.modbusAddress; address < entity.modbusAddress + converter.getModbusLength(entity); address++) {
            let value: IModbusResultOrError | undefined = {}

            switch (entity.registerType) {
              case ModbusRegisterType.AnalogInputs:
                value = values.analogInputs.get(address)
                break
              case ModbusRegisterType.HoldingRegister:
                value = values.holdingRegisters.get(address)
                break
              case ModbusRegisterType.Coils:
                value = values.coils.get(address)
                break
              case ModbusRegisterType.DiscreteInputs:
                value = values.discreteInputs.get(address)
                break
            }
            if (value && value.data) {
              data = data.concat(value.data)
            }
            // per-register errors are intentionally ignored; only data is aggregated
          }
          if (data && data.length > 0) {
            const mqtt = converter.modbus2mqtt(spec, entity.id, data)
            let identified = IdentifiedStates.unknown
            if (entity.converterParameters)
              if (entity.converter === 'number') {
                if (!(entity.converterParameters as Inumber).identification)
                  (entity as ImodbusEntity).identified = IdentifiedStates.unknown
                else {
                  //Inumber
                  const mm: IminMax = (entity.converterParameters as Inumber).identification!
                  identified =
                    mm.min <= (mqtt as number) && (mqtt as number) <= mm.max
                      ? IdentifiedStates.identified
                      : IdentifiedStates.notIdentified
                }
              } else {
                if (!(entity.converterParameters as Itext).identification) {
                  if ((entity.converterParameters as Iselect).options || (entity.converterParameters as Iselect).optionModbusValues) {
                    // Iselect
                    identified = mqtt != null ? IdentifiedStates.identified : IdentifiedStates.notIdentified
                  } else {
                    // no Converter parameters
                    identified = (mqtt as string).length ? IdentifiedStates.identified : IdentifiedStates.unknown
                  }
                } else {
                  // Itext
                  const reg = (entity.converterParameters as Itext).identification
                  if (reg) {
                    const re = new RegExp('^' + reg + '$')
                    identified = re.test(mqtt as string) ? IdentifiedStates.identified : IdentifiedStates.notIdentified
                  }
                }
              }
            rc.identified = identified
            rc.mqttValue = mqtt
            rc.modbusValue = data
          } else {
            rc.identified = IdentifiedStates.notIdentified
            rc.mqttValue = ''
            rc.modbusValue = []
          }
        } catch (error) {
          log.log(LogLevelEnum.error, error)
        }
      } else {
        log.log(LogLevelEnum.error, 'entity has no modbusaddress: entity id:' + entity.id + ' converter:' + entity.converter)
        // It remains an Ientity
      }
    } else
      log.log(LogLevelEnum.error, 'Converter not found: ' + spec.filename + ' ' + entity.converter + ' entity id: ' + +entity.id)

    return rc
  } else {
    const msg = 'EntityId ' + entityId + ' not found in specifcation '
    log.log(LogLevelEnum.error, msg)
    throw new Error(msg)
  }
}
