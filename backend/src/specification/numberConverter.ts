import { Converters, ModbusRegisterType } from '../shared/specification/index.js'
import { Converter } from './converter.js'
import { EnumNumberFormat, Inumber, Ispecification, Ientity } from '../shared/specification/index.js'
import { getMultiplier, getOffset } from './entityAccessors.js'

export class NumberConverter extends Converter {
  constructor(component?: Converters) {
    if (!component) component = 'number'
    super(component)
  }
  // Modbus itself only defines the byte order inside a register (big endian). How a device spreads a
  // 32 bit value over two registers is not standardized: some send the high word first, others the low
  // word first (e.g. Sungrow), and a few even swap the bytes inside a register. swapWords/swapBytes let
  // a specification describe that, so the raw registers are reordered into the canonical
  // "high word first, big endian bytes" layout before they are decoded.
  private static isNumberFormat32(numberFormat: EnumNumberFormat): boolean {
    return [EnumNumberFormat.float32, EnumNumberFormat.signedInt32, EnumNumberFormat.unsignedInt32].includes(numberFormat)
  }
  private static swapBytesInRegister(register: number): number {
    return ((register & 0xff) << 8) | ((register >> 8) & 0xff)
  }
  // Applies the entity's swap settings. Used in both directions: swapping is its own inverse.
  private static applySwaps(registers: number[], entity: Ientity, numberFormat: EnumNumberFormat): number[] {
    const params = entity.converterParameters as Inumber | undefined
    let rc = registers
    // Byte order inside each register.
    if (params?.swapBytes === true) rc = rc.map((r) => NumberConverter.swapBytesInRegister(r))
    // Word order. Only a 32 bit value has two words to swap.
    if (params?.swapWords === true && NumberConverter.isNumberFormat32(numberFormat) && rc.length >= 2)
      rc = [rc[1], rc[0], ...rc.slice(2)]
    return rc
  }
  modbus2mqtt(spec: Ispecification, entityid: number, value: number[]): number | string {
    const entity = spec.entities.find((e) => e.id == entityid)
    if (entity) {
      if (value.length == 0) throw new Error('NumberConverter.modbus2mqtt: No value in array')

      const numberFormat =
        entity.converterParameters != undefined && (entity.converterParameters as Inumber).numberFormat != undefined
          ? (entity.converterParameters as Inumber).numberFormat!
          : EnumNumberFormat.default

      if (NumberConverter.isNumberFormat32(numberFormat) && value.length < 2)
        throw new Error('NumberConverter.modbus2mqtt: a 32 bit number needs two registers, got ' + value.length)

      const registers = NumberConverter.applySwaps(value, entity, numberFormat)
      let v = registers[0]
      const buffer16 = Buffer.allocUnsafe(4)
      const buffer32 = Buffer.allocUnsafe(4)
      switch (numberFormat) {
        case EnumNumberFormat.float32:
          buffer32.writeUInt16BE(registers[0])
          buffer32.writeUInt16BE(registers[1], 2)
          v = buffer32.readFloatBE()
          break
        case EnumNumberFormat.signedInt16:
          buffer16.writeUInt16BE(registers[0])
          v = buffer16.readInt16BE()
          break
        case EnumNumberFormat.unsignedInt32:
          buffer32.writeUInt16BE(registers[0])
          buffer32.writeUInt16BE(registers[1], 2)
          v = buffer32.readUint32BE()
          break
        case EnumNumberFormat.signedInt32:
          buffer32.writeUInt16BE(registers[0])
          buffer32.writeUInt16BE(registers[1], 2)
          v = buffer32.readInt32BE()
          break
      }
      let multiplier = getMultiplier(spec.entities, entityid)
      let offset = getOffset(spec.entities, entityid)
      if (!multiplier) multiplier = 1
      if (!offset) offset = 0
      v = v * multiplier + offset
      return v
    } else throw new Error('entityid not found in entities')
  }

  override mqtt2modbus(spec: Ispecification, entityid: number, value: number | string): number[] {
    let multiplier = getMultiplier(spec.entities, entityid)
    let offset = getOffset(spec.entities, entityid)

    if (!multiplier) multiplier = 1
    if (!offset) offset = 0
    const entity = spec.entities.find((e) => e.id == entityid)
    if (entity) {
      const numberFormat =
        entity.converterParameters != undefined && (entity.converterParameters as Inumber).numberFormat != undefined
          ? (entity.converterParameters as Inumber).numberFormat!
          : EnumNumberFormat.default
      const buf: Buffer = Buffer.allocUnsafe(4)

      value = ((value as number) - offset) / multiplier
      const v = value
      // The canonical registers are built first; the swaps then bring them into the device's own
      // layout - the exact inverse of modbus2mqtt, because swapping is its own inverse.
      const swap = (registers: number[]): number[] => NumberConverter.applySwaps(registers, entity, numberFormat)
      switch (numberFormat) {
        case EnumNumberFormat.float32:
          buf.writeFloatBE(v)
          return swap([buf.readUInt16BE(0), buf.readUInt16BE(2)])
        case EnumNumberFormat.signedInt16:
          buf.writeInt16BE(v)
          return swap([buf.readUInt16BE()])
        case EnumNumberFormat.unsignedInt32:
          buf.writeUint32BE(v)
          return swap([buf.readUInt16BE(0), buf.readUInt16BE(2)])
        case EnumNumberFormat.signedInt32:
          buf.writeInt32BE(v)
          return swap([buf.readUInt16BE(0), buf.readUInt16BE(2)])
        default:
          return swap([v])
      }
    }
    throw new Error('entityid not found in entities')
  }
  override getParameterType(_entity: Ientity /* eslint-disable-line @typescript-eslint/no-unused-vars */): string | undefined {
    return 'Inumber'
  }
  override getModbusLength(entity: Ientity): number {
    if (entity.converterParameters == undefined || (entity.converterParameters as Inumber).numberFormat == undefined) return 1
    switch ((entity.converterParameters as Inumber).numberFormat) {
      case EnumNumberFormat.float32:
      case EnumNumberFormat.signedInt32:
      case EnumNumberFormat.unsignedInt32:
        return 2
      case EnumNumberFormat.signedInt16:
      default:
        return 1
    }
  }
  override getModbusRegisterTypes(): ModbusRegisterType[] {
    return [ModbusRegisterType.HoldingRegister, ModbusRegisterType.AnalogInputs]
  }
}
