/* eslint-disable vitest/no-disabled-tests */
import { Bus } from '../../src/server/bus.js'
import { Config } from '../../src/server/config.js'
import {
  Itext,
  IdentifiedStates,
  ImodbusEntity,
  Inumber,
  Converters,
  Ientity,
  Ispecification,
  ModbusRegisterType,
  FileLocation,
  SpecificationFileUsage,
} from '../../src/shared/specification/index.js'
import { Modbus, ModbusForTest } from '../../src/server/modbus.js'
import { getReadRegisterResult } from '../../src/server/submitRequestMock.js'
import { initBussesForTest, setConfigsDirsForTest } from './configsbase.js'
import { Islave, ModbusTasks } from '../../src/shared/server/index.js'
import { ConfigSpecification, IfileSpecification, emptyModbusValues } from '../../src/specification/index.js'
import { expect, it, describe, beforeEach, beforeAll, afterAll } from 'vitest'
import Debug from 'debug'
import { ConfigBus } from '../../src/server/configbus.js'
import { TempConfigDirHelper } from './testhelper.js'
setConfigsDirsForTest()
const debug = Debug('modbus_test')

let tempHelper: TempConfigDirHelper
beforeAll(() => {
  // TODO Fix test ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
  tempHelper = new TempConfigDirHelper('modbus_test')
  tempHelper.setup()
  initBussesForTest()
})
afterAll(() => {
  if (tempHelper) tempHelper.cleanup()
})
beforeEach(() => {
  spec = {
    entities: [
      {
        id: 1,
        mqttname: 'mqtt',
        converter: 'sensor' as Converters,
        modbusAddress: 4,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        icon: '',
        converterParameters: {
          multiplier: 0.1,
          offset: 0,
          uom: 'cm',
          identification: { min: 0, max: 200 },
        },
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
        converter: 'select' as Converters,
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
})

let spec: Ispecification
const mr = new Modbus()
let dev: Islave | undefined = undefined
const ent: ImodbusEntity = {
  id: 1,
  mqttname: 'mqtt',
  modbusAddress: 3,
  readonly: true,
  registerType: ModbusRegisterType.HoldingRegister,
  modbusValue: [1],
  mqttValue: '',
  identified: IdentifiedStates.unknown,
  converterParameters: { multiplier: 0.01 },
  converter: 'number',
}
const ents: Ientity[] = [ent]
const entText: ImodbusEntity = {
  id: 2,
  mqttname: 'mqtt',
  modbusAddress: 5,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  modbusValue: [(65 << 8) | 66, (67 << 8) | 68],
  mqttValue: '',
  identified: IdentifiedStates.unknown,
  converterParameters: { stringlength: 10 },
  converter: 'text',
}
let readConfig = new Config()
let prepared: boolean = false
function prepareIdentification() {
  if (!prepared) {
    prepared = true
    readConfig = new Config()
    readConfig.readYaml()
    ConfigBus.readBusses()
    new ConfigSpecification().readYaml()
    dev = ConfigBus.getSlave(0, 1)!
  }
}

describe('Modbus read', () => {
  it('Modbus read', async () => {
    const readConfig: Config = new Config()
    readConfig.readYaml()
    ConfigBus.readBusses()
    new ConfigSpecification().readYaml()
    const dev = ConfigBus.getSlave(0, 1)!
    expect(dev).toBeDefined
    await new Promise<void>((resolve, reject) => {
      Modbus.getModbusSpecification(
        ModbusTasks.specification,
        Bus.getBus(0)!.getModbusAPI(),
        Bus.getBus(0)!.getSlaveBySlaveId(1)!,
        dev!.specificationid!,
        (_e) => {
          expect(false).toBeTruthy()
          reject(_e)
        }
      ).subscribe((spec1) => {
        const spec = ConfigSpecification.getSpecificationByFilename(dev!.specificationid!)!
        expect(spec).toBeDefined()
        expect((spec1?.entities[0] as ImodbusEntity).mqttValue).toBe((spec1?.entities[0] as ImodbusEntity).mqttValue)
        expect(((spec1?.entities[0] as ImodbusEntity).mqttValue as number) - 21).toBeLessThan(0.001)
        resolve()
      })
    })
  })

  it('Modbus read Entity identifiation unknown', async () => {
    prepareIdentification()
    expect(dev).toBeDefined
    spec.entities = ents
    try {
      const arg0 = await mr.readEntityFromModbus(Bus.getBus(0)!.getModbusAPI(), 1, spec, 1)
      expect(arg0!.identified).toBe(IdentifiedStates.unknown)
    } catch {
      expect(false).toBeTruthy()
    }
  })
  it('Modbus read Entity identifiation identified', async () => {
    prepareIdentification()
    expect(dev).toBeDefined
    if (ent.converterParameters)
      (ent.converterParameters as Inumber).identification = {
        min: 0.01,
        max: 0.4,
      }
    spec.entities = ents
    const arg0 = await mr.readEntityFromModbus(Bus.getBus(0)!.getModbusAPI(), 1, spec, 1)
    expect(arg0!.identified).toBe(IdentifiedStates.identified)
  })
  it('Modbus read Entity identifiation Iselect identified', async () => {
    prepareIdentification()
    expect(dev).toBeDefined
    Config['config'].fakeModbus = true

    if (ent.converterParameters)
      (ent.converterParameters as Inumber).identification = {
        min: 0.02,
        max: 0.04,
      }
    ent.converter = 'select'
    ent.modbusValue = [1]
    ent.converterParameters = {
      optionModbusValues: [0, 1, 2, 3],
    }
    ent.id = 1
    spec.entities = [ent]
    const arg0 = await mr.readEntityFromModbus(Bus.getBus(0)!.getModbusAPI(), 1, spec, 1)
    expect(arg0!.identified).toBe(IdentifiedStates.identified)
    Config['config'].fakeModbus = true
  })

  it('Modbus read Entity identifiation string not identified', async () => {
    //@ts-ignore
    prepareIdentification()
    Config['config'].fakeModbus = true
    expect(dev).toBeDefined
    if (entText.converterParameters) (entText.converterParameters as Itext).identification = 'test'
    spec.entities = [entText]
    const arg0 = await mr.readEntityFromModbus(Bus.getBus(0)!.getModbusAPI(), 2, spec, 2)
    expect(arg0!.identified).toBe(IdentifiedStates.notIdentified)
  })

  it('Modbus read Entity identifiation string identified', async () => {
    prepareIdentification()
    Config['config'].fakeModbus = true
    //jest.spyOn(Modbus.prototype, 'readHoldingRegister').mockReturnValue([65 << 8 | 66, 67 << 8 | 68])
    expect(dev).toBeDefined
    if (entText.converterParameters) (entText.converterParameters as Itext).identification = 'ABCD'
    dev!.slaveid = 2
    spec.entities = [entText]
    const mb = new Modbus()
    const arg0 = await mb.readEntityFromModbus(Bus.getBus(1)!.getModbusAPI(), 2, spec, 2)
    expect(arg0!.identified).toBe(IdentifiedStates.identified)
  })
  // it("Modbus getUsbDevices", done => {
  //     mr.getUsbDevices();
  //     done();
  // });
})
describe('isEntityActive', () => {
  const entity = (bit: number) => ({
    modbusAddress: 0,
    condition: { register: 501, bit, comparator: 'eq', value: 1 },
  })
  it('activates the entity when the condition bit is set (WRF06 register 501 = 33)', () => {
    // 33 = 0b00100001 -> bit0 (temp) and bit5 (co2) set
    expect(Modbus.isEntityActive(entity(0), 33)).toBe(true)
    expect(Modbus.isEntityActive(entity(5), 33)).toBe(true)
  })
  it('deactivates the entity when the condition bit is clear', () => {
    expect(Modbus.isEntityActive(entity(1), 33)).toBe(false) // rH bit1 clear
    expect(Modbus.isEntityActive(entity(6), 33)).toBe(false) // VOC bit6 clear
  })
  it('returns false when the condition register value is missing', () => {
    expect(Modbus.isEntityActive(entity(0), undefined)).toBe(false)
  })
  it('treats entities without a condition as always active', () => {
    expect(Modbus.isEntityActive({ modbusAddress: 502 }, 33)).toBe(true)
  })
})
it.skip('Modbus modbusDataToSpec spec.identified = identified', () => {
  const spec: IfileSpecification = {
    version: '0.1',
    entities: [
      {
        id: 1,
        mqttname: 'mqtt',
        converter: 'number' as Converters,
        modbusAddress: 4,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        icon: '',
        converterParameters: {
          multiplier: 0.1,
          offset: 0,
          uom: 'cm',
          identification: { min: 0, max: 200 },
        },
      },
      {
        id: 2,
        mqttname: 'mqtt2',
        converter: 'select_sensor' as Converters,
        modbusAddress: 2,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        icon: '',
        converterParameters: {
          options: [
            { key: 1, name: 'cm' },
            { key: 2, name: 'mm' },
            { key: 3, name: 'mPa' },
          ],
        },
      },
      {
        id: 3,
        mqttname: 'mqtt3',
        converter: 'select_sensor' as Converters,
        modbusAddress: 3,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        icon: '',
        converterParameters: {
          options: [
            { key: 0, name: '1' },
            { key: 1, name: '0.1' },
            { key: 2, name: '0.01' },
            { key: 3, name: '0.001' },
          ],
        },
      },
    ],
    status: 2,
    manufacturer: 'unknown',
    model: 'QDY30A',

    filename: 'waterleveltransmitter',
    i18n: [],
    files: [
      {
        url: '/documents/waterleveltransmitter.pdf',
        fileLocation: FileLocation.Local,
        usage: SpecificationFileUsage.documentation,
      },
      {
        url: 'https://m.media-amazon.com/images/I/51WMttnsOML._AC_SX569_.jpg',
        fileLocation: FileLocation.Local,
        usage: SpecificationFileUsage.img,
      },
    ],
    testdata: {},
  }
  //"modbusValue": [210], "mqttValue": 21,
  //        "modbusValue": [1], "mqttValue": "cm", "identified": 1,
  //"modbusValue": [1], "mqttValue": "0.1", "identified": 1,
  const results = emptyModbusValues()
  results.holdingRegisters.set(4, getReadRegisterResult(210))
  results.holdingRegisters.set(2, getReadRegisterResult(1))
  results.holdingRegisters.set(3, getReadRegisterResult(1))
  Config.getConfiguration()
  Config['config'].fakeModbus = false
  const m = new ModbusForTest()
  const result = m.modbusDataToSpecForTest(spec)
  debug(JSON.stringify(result))
  expect(result).toBeDefined()
  expect(result!.identified).toBe(IdentifiedStates.identified)
  Config['config'].fakeModbus = true
})

it('Modbus writeEntityMqtt', async () => {
  // TODO Fix test ModbusCache.prototype.writeRegisters = writeRegisters
  const readConfig: Config = new Config()
  readConfig.readYaml()
  new ConfigSpecification().readYaml()
  const dev = ConfigBus.getSlave(0, 1)!
  expect(dev).toBeDefined

  try {
    await Modbus.writeEntityMqtt(Bus.getBus(0)!.getModbusAPI(), 1, spec, 3, 'test')
  } catch (e) {
    expect(`[FAIL] ${e}`.trim()).toBeFalsy()
  }
})

describe('conditional same-register variants (WRF06 register 400 selects mapping)', () => {
  const mkSpec = () => {
    const si = {
      id: 1, mqttname: 'temp_si', converter: 'number', modbusAddress: 0,
      registerType: ModbusRegisterType.HoldingRegister, readonly: true,
      converterParameters: { multiplier: 0.1, numberFormat: 0, uom: '°C' },
      condition: { register: 400, comparator: 'eq', value: 1 },
      valid: true,
    }
    const imp = {
      id: 2, mqttname: 'temp_imp', converter: 'number', modbusAddress: 0,
      registerType: ModbusRegisterType.HoldingRegister, readonly: true,
      converterParameters: { multiplier: 0.1, numberFormat: 0, uom: '°F' },
      condition: { register: 400, comparator: 'eq', value: 2 },
      valid: true,
    }
    return {
      filename: 'multiaddr', model: 'WRF06', manufacturer: 'Thermokon',
      entities: [si, imp],
    } as unknown as IfileSpecification
  }
  it('reads the active variant value at the shared address (400=1 -> SI active, Imperial inactive)', async () => {
    const spec = mkSpec()
    const cond = new Map<number, { data: number[] }>([[400, { data: [1] }]])
    const vals = new Map<number, { data: number[] }>([[0, { data: [240] }]])
    const modbusAPI = {
      getName: () => 'test',
      readModbusRegister: async (slaveid: number, addresses: Set<ImodbusAddress>, _o: unknown) => {
        const out = { holdingRegisters: new Map(), analogInputs: new Map(), coils: new Map(), discreteInputs: new Map() }
        const first = addresses.values().next().value
        if (first.address === 400) { cond.forEach((v, k) => out.holdingRegisters.set(k, v)) }
        else { vals.forEach((v, k) => out.holdingRegisters.set(k, v)) }
        return out
      },
    } as any
    const emitted: ImodbusSpecification[] = []
    await Modbus.getModbusSpecificationFromData(
      ModbusTasks.specification,
      modbusAPI,
      5,
      spec,
      { next: (mspec: ImodbusSpecification) => emitted.push(mspec) } as any
    )
    expect(emitted.length).toBe(1)
    const si = emitted[0].entities.find((e) => e.id === 1)
    const imp = emitted[0].entities.find((e) => e.id === 2)
    // SI (400=1) is active -> its value is 240*0.1 = 24; Imperial (400=2) is inactive -> mqttValue empty
    expect(si?.mqttValue).toBe(24)
    expect(imp?.mqttValue).toBe('')
  })
  it('reads the other variant when 400=2 (Imperial active, SI inactive)', async () => {
    const spec = mkSpec()
    const modbusAPI = {
      getName: () => 'test',
      readModbusRegister: async (slaveid: number, addresses: Set<ImodbusAddress>, _o: unknown) => {
        const out = { holdingRegisters: new Map(), analogInputs: new Map(), coils: new Map(), discreteInputs: new Map() }
        const first = addresses.values().next().value
        if (first.address === 400) out.holdingRegisters.set(400, { data: [2] })
        else out.holdingRegisters.set(0, { data: [240] })
        return out
      },
    } as any
    const emitted: ImodbusSpecification[] = []
    await Modbus.getModbusSpecificationFromData(
      ModbusTasks.specification,
      modbusAPI,
      5,
      spec,
      { next: (mspec: ImodbusSpecification) => emitted.push(mspec) } as any
    )
    const si = emitted[0].entities.find((e) => e.id === 1)
    const imp = emitted[0].entities.find((e) => e.id === 2)
    expect(si?.mqttValue).toBe('')
    expect(imp?.mqttValue).toBe(24)
  })
})

describe('multi-condition same-register variants (WRF06 400 AND 501)', () => {
  const mkSpec = () => ({
    filename: 'multicond', model: 'WRF06', manufacturer: 'Thermokon',
    entities: [
      { id: 2, mqttname: 'temperature', converter: 'number', modbusAddress: 0,
        registerType: ModbusRegisterType.HoldingRegister, readonly: true,
        converterParameters: { multiplier: 0.1, numberFormat: 0, uom: '°C' },
        conditions: [ { register: 400, comparator: 'eq', value: 1 }, { register: 501, bit: 0, comparator: 'eq', value: 1 } ],
        valid: true },
      { id: 3, mqttname: 'temperature_imp', converter: 'number', modbusAddress: 0,
        registerType: ModbusRegisterType.HoldingRegister, readonly: true,
        converterParameters: { multiplier: 0.1, numberFormat: 0, uom: '°F' },
        conditions: [ { register: 400, comparator: 'eq', value: 2 }, { register: 501, bit: 0, comparator: 'eq', value: 1 } ],
        valid: true },
    ],
  } as unknown as IfileSpecification)
  async function run(reg400: number, reg501: number, raw: number) {
    const spec = mkSpec()
    const modbusAPI = {
      getName: () => 'test',
      readModbusRegister: async (_s: number, addresses: Set<ImodbusAddress>, _o: unknown) => {
        const out = { holdingRegisters: new Map(), analogInputs: new Map(), coils: new Map(), discreteInputs: new Map() }
        const first = addresses.values().next().value
        if (first.address === 400 || first.address === 501) {
          out.holdingRegisters.set(400, { data: [reg400] }); out.holdingRegisters.set(501, { data: [reg501] })
        } else out.holdingRegisters.set(0, { data: [raw] })
        return out
      },
    } as any
    const emitted: ImodbusSpecification[] = []
    await Modbus.getModbusSpecificationFromData(ModbusTasks.specification, modbusAPI, 5, spec, { next: (m) => emitted.push(m) } as any)
    return emitted[0].entities
  }
  it('SI temp active only when 400=1 AND 501 bit0 (sensor present)', async () => {
    const ents = await run(1, 0b00100001, 240) // SI + temp present
    const si = ents.find((e) => e.id === 2), imp = ents.find((e) => e.id === 3)
    expect(si?.mqttValue).toBe(24)
    expect(imp?.mqttValue).toBe('')
  })
  it('neither temp variant active when 400=1 but sensor 501 bit0 missing', async () => {
    const ents = await run(1, 0b00000010, 240) // SI but NO temp sensor
    const si = ents.find((e) => e.id === 2), imp = ents.find((e) => e.id === 3)
    expect(si?.mqttValue).toBe('')
    expect(imp?.mqttValue).toBe('')
  })
})
