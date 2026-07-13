import { ConverterMap } from '../../src/specification/index.js'
import { Converters, EnumNumberFormat, Ientity, Ispecification, ModbusRegisterType } from '../../src/shared/specification/index.js'
import { ConfigSpecification } from '../../src/specification/index.js'
import { it, expect } from '@jest/globals'

ConfigSpecification.setMqttdiscoverylanguage('en', undefined)
const spec: Ispecification = {
  entities: [
    {
      id: 1,
      mqttname: 'mqtt',
      converter: 'number' as Converters,
      modbusAddress: 4,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      icon: '',
      converterParameters: { multiplier: 0.1, offset: 0, uom: 'cm', identification: { min: 0, max: 200 } },
    },
    {
      id: 2,
      mqttname: 'mqtt2',
      converter: 'select_sensor' as Converters,
      modbusAddress: 2,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      icon: '',
      converterParameters: { optionModbusValues: [1, 2, 3] },
    },
    {
      id: 3,
      mqttname: 'mqtt3',
      converter: 'select_sensor' as Converters,
      modbusAddress: 3,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      icon: '',
      converterParameters: { optionModbusValues: [0, 1, 2, 3] },
    },
  ],
  status: 2,
  manufacturer: 'unknown',
  model: 'QDY30A',
  filename: 'waterleveltransmitter',
  i18n: [
    {
      lang: 'en',
      texts: [
        { textId: 'e1o.1', text: 'ON' },
        { textId: 'e1o.0', text: 'OFF' },
        { textId: 'e1o.2', text: 'test' },
      ],
    },
  ],
  files: [],
}

it('test sensor converter', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 0.01, offset: 0 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const sensorConverter = ConverterMap.getConverter(entity)
  const mqttValue = parseFloat(sensorConverter?.modbus2mqtt(spec, entity.id, [5]) as string)
  expect(mqttValue).toBe(0.05)
})
it('test sensor converter with stringlength', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { stringlength: 10 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const sensorConverter = ConverterMap.getConverter(entity)
  const r = [5, 6, 7]
  const mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, r)
  expect(parseFloat(mqttValue as string)).toBe(5)
})
it('test binary_sensor converter', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'binary',
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const sensorConverter = ConverterMap.getConverter(entity)
  let mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [0])
  expect(mqttValue).toBe('OFF')
  mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [1])
  expect(mqttValue).toBe('ON')
  entity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'binary',
    converterParameters: { optionModbusValues: [0, 1] },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [2])
  expect(mqttValue).toBe('ON')
})
it('test select_sensor converter', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'select',
    converterParameters: { optionModbusValues: [1, 2] },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let sensorConverter = ConverterMap.getConverter(entity)
  let mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [1])
  expect(mqttValue).toBe('ON')
  mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [2])
  expect(mqttValue).toBe('test')
  entity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'select',
    converterParameters: { optionModbusValues: [0, 1] },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  sensorConverter = ConverterMap.getConverter(entity)
})
const r68 = [(65 << 8) | 66, (67 << 8) | 68]
const r69 = [(65 << 8) | 66, (67 << 8) | 68, 69 << 8]

it('test text_sensor converter', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'text',
    converterParameters: { stringlength: 10 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const sensorConverter = ConverterMap.getConverter(entity)

  let mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, r68)
  expect(mqttValue).toBe('ABCD')

  mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, r69)
  expect(mqttValue).toBe('ABCDE')
})

it('test value_sensor converter', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'value',
    converterParameters: { value: 'testValue' },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const sensorConverter = ConverterMap.getConverter(entity)
  const mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [])
  expect(mqttValue).toBe('testValue')
})

it('test text converter', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'text',
    converterParameters: { stringlength: 10 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const converter = ConverterMap.getConverter(entity)
  const mqttValue = converter?.modbus2mqtt(spec, entity.id, r68)
  expect(mqttValue).toBe('ABCD')
  let modbusValue: any = converter!.mqtt2modbus(spec, entity.id, 'ABCD')
  expect(modbusValue).toEqual([(65 << 8) | 66, (67 << 8) | 68])
  modbusValue = converter!.mqtt2modbus(spec, entity.id, 'ABCDE')
  expect(modbusValue).toEqual([(65 << 8) | 66, (67 << 8) | 68, 69 << 8])
})

it('test number converter ignore decimal places when returning float', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 0.01, offset: 0, decimals: 1 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const converter = ConverterMap.getConverter(spec.entities[0])
  const mqttValue = parseFloat(converter?.modbus2mqtt(spec, entity.id, [6]) as string)
  expect(mqttValue).toBe(0.06)
  let modbusValue = converter?.mqtt2modbus(spec, entity.id, 0.07)
  // rounding is not relevant
  expect(Math.abs(modbusValue![0] - 7)).toBeLessThan(0.00001)

  entity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 0.01, offset: 20 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  modbusValue = converter?.mqtt2modbus(spec, entity.id, 20.07)
  expect(Math.abs(modbusValue![0] - 7)).toBeLessThan(0.00001)
})
it('test number float', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.float32 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const converter = ConverterMap.getConverter(spec.entities[0])
  const modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, 17.3)
  expect(modbusValue![0]).toBe(16778)
  expect(modbusValue![1]).toBe(26214)
  const mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(Math.abs(mqtt! - 17.3)).toBeLessThan(0.00001)
})

it('test number signed int16', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.signedInt16 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const converter = ConverterMap.getConverter(spec.entities[0])
  const modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, -3)
  expect(modbusValue![0]).toBeGreaterThan(0)
  const mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(mqtt).toBe(-3)
})

it('test number signed int32 - positive', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.signedInt32 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const converter = ConverterMap.getConverter(spec.entities[0])
  const modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, 20)

  expect(modbusValue![1]).toBeGreaterThan(0)
  const mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(mqtt).toBe(20)
})

it('test number signed int32 - positive max', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.signedInt32 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const converter = ConverterMap.getConverter(spec.entities[0])
  const modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, 2147483647)

  expect(modbusValue![0]).toBeGreaterThan(0)
  const mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(mqtt).toBe(2147483647)
})

it('test number signed int32 - negative', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.signedInt32 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const converter = ConverterMap.getConverter(spec.entities[0])
  const modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, -1147483647)

  expect(modbusValue![0]).toBeGreaterThan(0)
  expect(modbusValue![1]).toBeGreaterThan(0)
  const mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(mqtt).toBe(-1147483647)
})

it('test number unsigned int32 - max', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.unsignedInt32 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]

  const converter = ConverterMap.getConverter(spec.entities[0])
  const modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, 4294967295)

  expect(modbusValue![0]).toBeGreaterThan(0)
  const mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(mqtt).toBe(4294967295)
})

it('test select converter', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'select',
    converterParameters: { optionModbusValues: [1, 2] },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let converter = ConverterMap.getConverter(entity)
  let modbusValue = converter?.mqtt2modbus(spec, entity.id, 'test')
  expect(modbusValue![0]).toBe(2)
  entity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'select',
    converterParameters: { optionModbusValues: [1, 2] },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  converter = ConverterMap.getConverter(entity)
  modbusValue = converter?.mqtt2modbus(spec, entity.id, 'ON')
})
it('test button converter', () => {
  const entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'binary',
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  const converter = ConverterMap.getConverter(entity)
  let modbusValue = converter?.mqtt2modbus(spec, entity.id, 'ON')
  expect(modbusValue![0]).toBe(1)
  modbusValue = converter?.mqtt2modbus(spec, entity.id, 'OFF')
  expect(modbusValue![0]).toBe(0)
})

// Issue #246: swapWords/swapBytes were stored in the specification and offered in the UI, but no
// converter ever read them. A Sungrow inverter sends the low word of a 32 bit value first, so
// "Total DC power" of 177 W arrived as 177 << 16 = 11599872 and the Swap Word toggle did nothing.
function numberEntity(converterParameters: object): Ientity {
  return {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number' as Converters,
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 5016,
    converterParameters,
  } as Ientity
}
function decode(entity: Ientity, registers: number[]): number {
  spec.entities = [entity]
  return ConverterMap.getConverter(entity)!.modbus2mqtt(spec, entity.id, registers) as number
}

it('decodes a 32 bit number, high word first, when swapWords is off', () => {
  const entity = numberEntity({ multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.unsignedInt32 })
  expect(decode(entity, [0, 177])).toBe(177)
  expect(decode(entity, [177, 0])).toBe(11599872) // 177 << 16 - the value the issue reports
})

it('decodes a 32 bit number, low word first, when swapWords is on', () => {
  const entity = numberEntity({
    multiplier: 1,
    offset: 0,
    numberFormat: EnumNumberFormat.unsignedInt32,
    swapWords: true,
  })
  // the raw registers from the issue: 5016 = 177, 5017 = 0
  expect(decode(entity, [177, 0])).toBe(177)
  expect(decode(entity, [0, 1])).toBe(65536)
})

it('swapWords works for signedInt32 and float32 too', () => {
  const signed = numberEntity({ multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.signedInt32, swapWords: true })
  expect(decode(signed, [0xffff, 0xffff])).toBe(-1)
  // -2 = 0xfffffffe: high word 0xffff, low word 0xfffe -> device sends the low word first
  expect(decode(signed, [0xfffe, 0xffff])).toBe(-2)

  const float = numberEntity({ multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.float32, swapWords: true })
  // 1.5f = 0x3fc00000
  expect(decode(float, [0x0000, 0x3fc0])).toBe(1.5)
})

it('swapBytes turns the bytes inside every register around', () => {
  const entity = numberEntity({ multiplier: 1, offset: 0, swapBytes: true })
  expect(decode(entity, [0x3412])).toBe(0x1234)

  const both = numberEntity({
    multiplier: 1,
    offset: 0,
    numberFormat: EnumNumberFormat.unsignedInt32,
    swapWords: true,
    swapBytes: true,
  })
  // canonical 0x12345678 arriving as low word first with swapped bytes: [0x7856, 0x3412]
  expect(decode(both, [0x7856, 0x3412])).toBe(0x12345678)
})

it('swapWords is ignored for a 16 bit number', () => {
  const entity = numberEntity({ multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.signedInt16, swapWords: true })
  expect(decode(entity, [0xffff])).toBe(-1)
})

it('rejects a 32 bit number that was read with a single register', () => {
  const entity = numberEntity({ multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.unsignedInt32 })
  spec.entities = [entity]
  expect(() => ConverterMap.getConverter(entity)!.modbus2mqtt(spec, entity.id, [177])).toThrow('two registers')
})

it('writes the registers back in the layout the device sent them in', () => {
  const entity = numberEntity({
    multiplier: 1,
    offset: 0,
    numberFormat: EnumNumberFormat.unsignedInt32,
    swapWords: true,
    swapBytes: true,
  })
  spec.entities = [entity]
  const converter = ConverterMap.getConverter(entity)!
  const registers = converter.mqtt2modbus(spec, entity.id, 0x12345678)
  expect(registers).toEqual([0x7856, 0x3412])
  // round trip: what we write is what we would read back
  expect(converter.modbus2mqtt(spec, entity.id, registers)).toBe(0x12345678)
})

it('text swapBytes turns the characters of a register around', () => {
  const entity = {
    id: 1,
    mqttname: 'serial',
    converter: 'text' as Converters,
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 1,
    converterParameters: { stringlength: 6, swapBytes: true },
  } as Ientity
  spec.entities = [entity]
  const converter = ConverterMap.getConverter(entity)!
  // "MODBUS" sent byte swapped per register: "OM", "BD", "SU"
  const registers = [0x4f4d, 0x4244, 0x5355]
  expect(converter.modbus2mqtt(spec, entity.id, registers)).toBe('MODBUS')
  expect(converter.mqtt2modbus(spec, entity.id, 'MODBUS')).toEqual(registers)
})
