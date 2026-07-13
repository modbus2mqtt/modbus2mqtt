import { Converter } from './converter.js'
import { Ivalue, Ientity, Ispecification, Converters, ModbusRegisterType, Itext } from '../shared/specification/index.js'

export class TextConverter extends Converter {
  constructor(component?: Converters) {
    if (!component) component = 'text'
    super(component)
  }
  private getStringlength(entity: Ientity): number {
    if (entity.converterParameters && 'stringlength' in entity.converterParameters && entity.converterParameters.stringlength)
      return entity.converterParameters.stringlength
    return 0
  }
  override getModbusLength(entity: Ientity): number {
    return this.getStringlength(entity) / 2
  }
  override modbus2mqtt(spec: Ispecification, entityid: number, value: number[]): number | string {
    const entity = spec.entities.find((e) => e.id == entityid)
    if (entity && entity.converter === 'value' && entity.converterParameters && (entity.converterParameters as Ivalue).value)
      return (entity.converterParameters as Ivalue).value
    const cvP = entity?.converterParameters as Itext
    const buffer = Buffer.allocUnsafe(cvP.stringlength * 2)
    // Some devices put the two characters of a register in the opposite order ("OMDBSU" instead of
    // "MODBUS"). swapBytes turns the register around before the text is read out of it.
    for (let idx = 0; idx < (cvP.stringlength + 1) / 2; idx++)
      buffer.writeUInt16BE(TextConverter.swapBytesIf(value[idx], cvP.swapBytes === true), idx * 2)

    const idx = buffer.findIndex((v) => v == 0)
    if (idx >= 0) return buffer.subarray(0, idx).toString()
    return buffer.toString()
  }
  // Swapping is its own inverse, so both directions use it.
  private static swapBytesIf(register: number, swap: boolean): number {
    if (!swap) return register
    return ((register & 0xff) << 8) | ((register >> 8) & 0xff)
  }
  override getModbusRegisterTypes(): ModbusRegisterType[] {
    return [ModbusRegisterType.HoldingRegister, ModbusRegisterType.AnalogInputs]
  }
  override mqtt2modbus(spec: Ispecification, entityid: number, _value: string): number[] {
    const entity = spec.entities.find((e) => e.id == entityid)
    if (!entity) throw new Error('entity not found in entities')
    const swapBytes = (entity.converterParameters as Itext | undefined)?.swapBytes === true
    const rc: number[] = []
    for (let i = 0; i < _value.length; i += 2) {
      const register = i + 1 < _value.length ? (_value.charCodeAt(i) << 8) | _value.charCodeAt(i + 1) : _value.charCodeAt(i) << 8
      rc.push(TextConverter.swapBytesIf(register, swapBytes))
    }
    return rc
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override getParameterType(_entity: Ientity): string | undefined {
    return 'Itext'
  }
}
