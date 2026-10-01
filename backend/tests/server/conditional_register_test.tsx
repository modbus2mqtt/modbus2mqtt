import { expect, it, describe } from 'vitest'
import { Modbus } from '../../src/server/modbus.js'
import { M2mSpecification, IfileSpecification, emptyModbusValues } from '../../src/specification/index.js'
import { ModbusRegisterType } from '../../src/shared/specification/index.js'
import { setConfigsDirsForTest } from './configsbase.js'
setConfigsDirsForTest()

const spec: IfileSpecification = {
  filename: 'cond-test',
  model: 'CondTest',
  manufacturer: 'Test',
  status: 2,
  version: '0.1',
  i18n: [],
  files: [],
  testdata: {
    holdingRegisters: [
      { address: 501, value: 0b00100001 }, // bit0 (temp) + bit5 (co2)
      { address: 0, value: 215 }, // temperature 21.5
      { address: 5, value: 623 }, // co2 623
    ],
  },
  entities: [
    {
      id: 1,
      mqttname: 'sensor_identification',
      converter: 'number',
      registerType: ModbusRegisterType.HoldingRegister,
      modbusAddress: 501,
      readonly: true,
      converterParameters: { multiplier: 1, offset: 0, decimals: 0, numberFormat: 0 },
    },
    {
      id: 2,
      mqttname: 'temperature',
      converter: 'number',
      registerType: ModbusRegisterType.HoldingRegister,
      modbusAddress: 0,
      readonly: true,
      condition: { register: 501, bit: 0, comparator: 'eq', value: 1 }, // active if bit0 set
      converterParameters: { multiplier: 0.1, offset: 0, decimals: 1, numberFormat: 0 },
    },
    {
      id: 3,
      mqttname: 'co2',
      converter: 'number',
      registerType: ModbusRegisterType.HoldingRegister,
      modbusAddress: 5,
      readonly: true,
      condition: { register: 501, bit: 5, comparator: 'eq', value: 1 }, // active if bit5 set
      converterParameters: { multiplier: 1, offset: 0, decimals: 0, numberFormat: 0 },
    },
    {
      id: 4,
      mqttname: 'voc',
      converter: 'number',
      registerType: ModbusRegisterType.HoldingRegister,
      modbusAddress: 6,
      readonly: true,
      condition: { register: 501, bit: 6, comparator: 'eq', value: 1 }, // active if bit6 set (NOT set in testdata)
      converterParameters: { multiplier: 0.1, offset: 0, decimals: 1, numberFormat: 0 },
    },
    {
      id: 5,
      mqttname: 'unit_system',
      converter: 'number',
      registerType: ModbusRegisterType.HoldingRegister,
      modbusAddress: 400,
      readonly: false,
      category: 'config',
      converterParameters: { multiplier: 1, offset: 0, decimals: 0, numberFormat: 0 },
    },
  ],
}

describe('conditional + config registers', () => {
  it('isEntityActive: bit activation', () => {
    expect(Modbus.isEntityActive({ condition: { register: 501, bit: 0, comparator: 'eq', value: 1 } }, 0b00100001)).toBe(true)
    expect(Modbus.isEntityActive({ condition: { register: 501, bit: 5, comparator: 'eq', value: 1 } }, 0b00100001)).toBe(true)
    // bit6 is NOT set -> entity inactive
    expect(Modbus.isEntityActive({ condition: { register: 501, bit: 6, comparator: 'eq', value: 1 } }, 0b00100001)).toBe(false)
  })
  it('isEntityActive: equals activation', () => {
    expect(Modbus.isEntityActive({ condition: { register: 400, comparator: 'eq', value: 1 } }, 1)).toBe(true)
    expect(Modbus.isEntityActive({ condition: { register: 400, comparator: 'eq', value: 2 } }, 1)).toBe(false)
  })
  it('isEntityActive: no condition -> always active', () => {
    expect(Modbus.isEntityActive({}, 123)).toBe(true)
  })
  it('isEntityActive: OR-set values (any-of)', () => {
    expect(Modbus.isEntityActive({ condition: { register: 0, values: [1, 8] } }, 1)).toBe(true)
    expect(Modbus.isEntityActive({ condition: { register: 0, values: [1, 8] } }, 8)).toBe(true)
    expect(Modbus.isEntityActive({ condition: { register: 0, values: [1, 8] } }, 0)).toBe(false)
    expect(Modbus.isEntityActive({ condition: { register: 0, values: [1, 8] } }, undefined)).toBe(false)
    // OR-set on a bit-resolved value
    expect(Modbus.isEntityActive({ condition: { register: 0, bit: 4, values: [0, 1] } }, 0x10)).toBe(true)
    expect(Modbus.isEntityActive({ condition: { register: 0, bit: 4, values: [0] } }, 0x10)).toBe(false)
  })
  it('conditionMatches: OR-set values', async () => {
    const { conditionMatches } = await import('../../src/specification/conditions.js')
    expect(conditionMatches({ register: 0, values: [0x0000, 0x0009] }, 0x0009)).toBe(true)
    expect(conditionMatches({ register: 0, values: [0x0000, 0x0009] }, 0x0001)).toBe(false)
    expect(conditionMatches({ register: 0, values: [0x0001, 0x0008] }, 0x0008)).toBe(true)
  })
  it('conditionMatches: mask + OR-set on a device-coding register', async () => {
    const { conditionMatches } = await import('../../src/specification/conditions.js')
    // Thermokon JOY device coding: 0x0600 | hwtype | rH(0x20) | CO2(0x40) | SR(0x10)
    const joy = (hwtype, bits = 0) => 0x0600 | hwtype | bits
    const ecAo2do = { register: 0, mask: 0x000f, values: [0x01, 0x08] }
    expect(conditionMatches(ecAo2do, joy(0x01, 0x20 | 0x40 | 0x10))).toBe(true) // EC AO2DO w/ rH+CO2+SR
    expect(conditionMatches(ecAo2do, joy(0x08))).toBe(true)                     // EC AO2DO 24V
    expect(conditionMatches(ecAo2do, joy(0x02))).toBe(false)                     // HC AO2DO
    expect(conditionMatches(ecAo2do, joy(0x05))).toBe(false)                     // HC 3AO
    // mask with a single eq value
    expect(conditionMatches({ register: 0, mask: 0x000f, comparator: 'eq', value: 0x04 }, joy(0x04, 0x20))).toBe(true)
    expect(conditionMatches({ register: 0, mask: 0x000f, comparator: 'eq', value: 0x04 }, joy(0x05))).toBe(false)
  })
  it('isEntityActive: mask + OR-set', () => {
    const joy = (hwtype, bits = 0) => 0x0600 | hwtype | bits
    expect(Modbus.isEntityActive({ condition: { register: 0, mask: 0x000f, values: [0x01, 0x08] } }, joy(0x01, 0x20 | 0x40 | 0x10))).toBe(true)
    expect(Modbus.isEntityActive({ condition: { register: 0, mask: 0x000f, values: [0x01, 0x08] } }, joy(0x05))).toBe(false)
  })
  it('fileToModbusSpecification populates active conditional entities and leaves inactive ones empty', () => {
    const mspec = M2mSpecification.fileToModbusSpecification(spec, emptyModbusValues())
    // with empty modbus values, all entities are not-identified
    const temp = mspec.entities.find((e) => e.id === 2)!
    expect((temp as { modbusValue?: number[] }).modbusValue).toEqual([])
  })
})

// ---- Two-phase conditional read via getModbusSpecificationFromData ----
import { IconsumerModbusAPI } from '../src/server/modbusAPI.js'
import { ImodbusAddress, ModbusTasks } from '../../src/shared/server/index.js'
import { Subject } from 'rxjs'

function makeFakeAPI(values: { address: number; value: number }[]): IconsumerModbusAPI {
  const byAddr = new Map(values.map((v) => [v.address, v.value]))
  const api = {
    readModbusRegister: async (_slaveId: number, addresses: Set<ImodbusAddress>) => {
      const rc = emptyModbusValues()
      for (const a of addresses) {
        if (byAddr.has(a.address)) rc.holdingRegisters.set(a.address, { data: [byAddr.get(a.address)!] })
      }
      return rc
    },
    writeModbusRegister: async () => {},
    readHoldingRegisters: async () => ({ data: [], duration: 0 }),
    readInputRegisters: async () => ({ data: [], duration: 0 }),
    getName: () => 'fake',
  } as unknown as IconsumerModbusAPI
  return api
}

describe('two-phase conditional read', () => {
  it('reads condition register first and only polls active value registers', async () => {
    // 501 = bits: temp(0)=1, co2(5)=1, voc(6)=0
    const api = makeFakeAPI([
      { address: 501, value: 0b00100001 },
      { address: 0, value: 215 },
      { address: 5, value: 623 },
      // NOTE: register 6 (voc) has NO fake value -> simulated not-present
    ])
    const sub = new Subject<any>()
    const result = new Promise<any>((resolve) => sub.subscribe((m) => resolve(m)))
    await Modbus.getModbusSpecificationFromData(ModbusTasks.poll, api, 1, spec, sub)
    const mspec = await result
    const temp = mspec.entities.find((e: any) => e.id === 2)!
    const co2 = mspec.entities.find((e: any) => e.id === 3)!
    const voc = mspec.entities.find((e: any) => e.id === 4)!
    const cfg = mspec.entities.find((e: any) => e.id === 5)!
    expect(temp.mqttValue).toBe(21.5) // 215 * 0.1
    expect(co2.mqttValue).toBe(623)
    // voc condition bit 6 not set -> not-identified / empty
    expect(voc.modbusValue).toEqual([])
    expect(voc.identified).toBe(0) // IdentifiedStates.notIdentified
    // config register is excluded from the value poll -> no modbusValue
    expect(cfg.modbusValue).toEqual([])
    expect(cfg.mqttValue).toBe('')
  })
})
