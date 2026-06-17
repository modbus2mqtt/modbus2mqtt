import { Ientity, ModbusRegisterType, Ispecification, Converters } from '../shared/specification/index.js'

export interface ReadRegisterResult {
  data: Array<number>
  buffer: Buffer
}
// Base class for all converters
export abstract class Converter {
  constructor(protected component: Converters) {}

  getModbusLength(_dummy: Ientity): number {
    return 1
  }
  // Static converters (e.g. a fixed OBIS code) have no modbus address.
  // Override to return false for those.
  usesModbusAddress(): boolean {
    return true
  }

  abstract modbus2mqtt(spec: Ispecification, entityid: number, value: number[]): number | string
  abstract mqtt2modbus(spec: Ispecification, entityid: number, _value: number | string): number[]
  // the following methods must work w/o meta data because they are needed for the converter ui
  getRequiredParameters(): string[] {
    return []
  }
  getOptionalParameters(): string[] {
    return ['value_sensor', 'discovertemplate']
  }
  publishModbusValues(): boolean {
    return false
  }

  abstract getModbusRegisterTypes(): ModbusRegisterType[]

  getParameterType(_entity: Ientity): string | undefined {
    return undefined
  }
}
