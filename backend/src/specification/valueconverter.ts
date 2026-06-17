import { Converter } from './converter.js'
import { Converters, Ispecification, Ivalue, ModbusRegisterType } from '../shared/specification/index.js'

export class ValueConverter extends Converter {
  override mqtt2modbus(_spec: Ispecification, _entityid: number, _value: string | number): number[] {
    throw new Error('fixed value has no modbus value.')
  }
  override getModbusRegisterTypes(): ModbusRegisterType[] {
    return [ModbusRegisterType.AnalogInputs, ModbusRegisterType.HoldingRegister]
  }
  override usesModbusAddress(): boolean {
    return false
  }
  constructor(component?: Converters) {
    if (!component) component = 'value'
    super(component)
  }
  modbus2mqtt(spec: Ispecification, entityid: number): string | number {
    const entity = spec.entities.find((e) => e.id == entityid)
    if (entity && (entity.converterParameters as Ivalue).value) return (entity.converterParameters as Ivalue).value
    else return ''
  }
}
