/* eslint-disable vitest/no-disabled-tests */
import { Config } from '../../src/server/config.js'
import {
  ImodbusEntity,
  ImodbusSpecification,
  ModbusRegisterType,
  VariableTargetParameters,
} from '../../src/shared/specification/index.js'
import { ItopicAndPayloads, MqttDiscover } from '../../src/server/mqttdiscover.js'
import { MqttClient } from 'mqtt'
import { FakeModes, FakeMqtt, initBussesForTest, setConfigsDirsForTest } from './configsbase.js'
import { Bus } from '../../src/server/bus.js'
import Debug from 'debug'
import { ConfigSpecification, Logger } from '../../src/specification/index.js'
import { expect, test, beforeAll, vi, afterAll } from 'vitest'
import { Islave, Slave } from '../../src/shared/server/index.js'
import { ConfigBus } from '../../src/server/configbus.js'
import { Modbus } from '../../src/server/modbus.js'
import { MqttConnector } from '../../src/server/mqttconnector.js'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions.js'
import { TempConfigDirHelper } from './testhelper.js'
const debug = Debug('mqttdiscover_test')

class MdFakeMqtt extends FakeMqtt {
  public override publish(topic: string, message: Buffer, opts?: unknown, callback?: (err?: Error) => void): void {
    if (topic.endsWith('/availabitlity/')) {
      debug('publish ' + topic + '\n' + message)
    } else if (topic.endsWith('/state/')) {
      // a state topic
      switch (this.fakeMode) {
        case FakeModes.Poll:
          expect(message.length).not.toBe(0)
          this.isAsExpected = true
          break
      }
    }
    debug('publish: ' + topic + '\n' + message)
    const cb = typeof opts === 'function' ? (opts as (err?: Error) => void) : callback
    if (cb) cb()
  }
}

let oldLog: any
let slave: Islave
let spec: ImodbusSpecification
const selectTestId = 3
const selectTestWritableId = 5
let msub1: MqttSubscriptions
const selectTest: ImodbusEntity = {
  id: selectTestWritableId,
  mqttname: 'selecttestWr',
  modbusAddress: 7,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  converter: 'select',
  modbusValue: [],
  mqttValue: '300',
  identified: 1,
  converterParameters: { optionModbusValues: [1, 2, 3] },
}

const selectTestWritable: ImodbusEntity = {
  id: selectTestId,
  mqttname: 'selecttest',
  modbusAddress: 1,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: false,
  converter: 'select',
  modbusValue: [],
  mqttValue: '300',
  identified: 1,
  converterParameters: { optionModbusValues: [1, 2, 3] },
}
let mqttDiscoverTestHelper: TempConfigDirHelper
beforeAll(async () => {
  // Fix ModbusCache ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
  oldLog = Logger.prototype.log
  setConfigsDirsForTest()
  Config['config'] = {} as any

  const conn = new MqttConnector()
  msub1 = new MqttSubscriptions(conn)
  // Ensure ConfigBus events are subscribed before busses/slaves are loaded
  // so that subscribedSlaves gets populated during init.
  new MqttDiscover(conn, msub1)
  // trigger subscription to ConfigBus Events
  setConfigsDirsForTest()
  mqttDiscoverTestHelper = new TempConfigDirHelper('httpserver-test')
  mqttDiscoverTestHelper.setup()
  initBussesForTest()
  const fake = new FakeMqtt(msub1, FakeModes.Poll)
  conn['client'] = fake as any as MqttClient
  conn['connectMqtt'] = function () {
    conn['onConnect'](conn['client']!)
  }

  const readConfig: Config = new Config()
  await readConfig.readYamlAsync()
  Config.setFakeModbus(true)
  new ConfigSpecification().readYaml()
  ConfigBus.readBusses()
  const bus = Bus.getBus(0)
  spec = {} as ImodbusSpecification
  slave = {
    specificationid: 'deye',
    slaveid: 2,
    pollInterval: 100,
  }

  const serialNumber: ImodbusEntity = {
    id: 0,
    mqttname: 'serialnumber',
    variableConfiguration: {
      targetParameter: VariableTargetParameters.deviceIdentifiers,
    },
    converter: 'text',
    modbusValue: [],
    mqttValue: '123456',
    identified: 1,
    converterParameters: { stringlength: 12 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  const currentSolarPower: ImodbusEntity = {
    id: 1,
    mqttname: 'currentpower',
    converter: 'number',
    modbusValue: [],
    mqttValue: '300',
    identified: 1,
    converterParameters: { uom: 'kW' },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    modbusAddress: 2,
  }
  spec.filename = 'deye'
  spec.manufacturer = 'Deye'
  spec.model = 'SUN-10K-SG04LP3-EU'
  spec.i18n = [{ lang: 'en', texts: [] }]
  spec.i18n[0].texts = [
    { textId: 'name', text: 'Deye Inverter' },
    { textId: 'e1', text: 'Current Power' },
    { textId: 'e3', text: 'Select Test' },
    { textId: 'e3o.1', text: 'Option 1' },
    { textId: 'e3o.2', text: 'Option 2' },
    { textId: 'e3o.3', text: 'Option 3' },
    { textId: 'e5', text: 'Select Test' },
    { textId: 'e5o.1', text: 'Option 1' },
    { textId: 'e5o.2', text: 'Option 2' },
    { textId: 'e5o.3', text: 'Option 3' },
  ]
  spec.entities = []
  spec.entities.push(serialNumber)
  spec.entities.push(currentSolarPower)
  spec.entities.push(selectTest)
  slave.specification = spec as any
  new ConfigSpecification().writeSpecification(spec as any, () => {}, spec.filename)
  bus!.writeSlave(slave)
})
afterAll(() => {
  Logger.prototype.log = oldLog
  mqttDiscoverTestHelper.cleanup()
})

// function spyMqttOnMessage(ev: string, _cb: Function): MqttClient {
//   if (ev === 'message') {
//     for (let tp of tps) {
//       md!['onMqttMessage'](tp.topic, Buffer.from(tp.payload as string, 'utf8'))
//     }
//   }
//   return md!['client'] as MqttClient
// }

test('Discover', async () => {
  const conn = new MqttConnector()
  const disc = new MqttDiscover(conn, msub1)
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)

  Config['config'].mqttusehassio = false
  await new Config().getMqttConnectOptions().then(() => {
    const s = structuredClone(spec)
    s.entities.push(selectTestWritable)

    const payloads: ItopicAndPayloads[] = disc['generateDiscoveryPayloads'](
      new Slave(0, slave, Config.getConfiguration().mqttbasetopic),
      s
    )
    expect(payloads.length).toBe(3)
    const payloadCurrentPower = JSON.parse(payloads[0].payload as string)
    const payloadSelectTestPower = JSON.parse(payloads[1].payload as string)
    expect(payloadCurrentPower.name).toBe('Current Power')
    expect(payloadCurrentPower.unit_of_measurement).toBe('kW')
    expect(payloadSelectTestPower.device.name).toBe('Deye Inverter')
    expect(payloadSelectTestPower.name).toBe('Select Test')
    expect(payloadSelectTestPower.options).not.toBeDefined()
    expect(payloads[1].topic.indexOf('/sensor/')).toBeGreaterThan(0)
    const payloadSelectTestWritable = JSON.parse(payloads[2].payload as string)
    expect(payloads[2].topic.indexOf('/select/')).toBeGreaterThan(0)
    expect(payloadSelectTestWritable.device_class).toBe('enum')
    expect(payloadSelectTestWritable.options).toBeDefined()
    expect(payloadSelectTestWritable.options.length).toBeGreaterThan(0)
    expect(payloadSelectTestWritable.command_topic).toBeDefined()
    const pl = JSON.parse(payloads[0].payload as string)
    //expect(pl.unit_of_measurement).toBe("kW");
    expect(pl.device.manufacturer).toBe(spec.manufacturer)
    expect(pl.device.model).toBe(spec.model)
    return
  })
})
// test("pollIntervallToMilliSeconds", (done) => {
//     new Config().getMqttConnectOptions().then((options) => {
//         let md = new MqttDiscover(options,"en");
//         expect(md['pollIntervallToMilliSeconds']("5 min") as any).toBe(5 * 60 * 1000);
//         expect(md['pollIntervallToMilliSeconds']("5 sec") as any).toBe(5 * 1000);
//         expect(md['pollIntervallToMilliSeconds']("15 sec") as any).toBe(15 * 1000);
//         done();
//     });

// });
test.skip('validateConnection success', () => {
  const md = new MqttConnector()
  md.validateConnection(undefined, (valid) => {
    expect(valid).toBeTruthy()
  })
})

test.skip('validateConnection invalid port', () => {
  const options = Config.getConfiguration().mqttconnect
  options.mqttserverurl = 'mqtt://localhost:999'
  options.connectTimeout = 200
  const md = new MqttConnector()
  md.validateConnection(undefined, (valid) => {
    expect(valid).toBeFalsy()
  })
})

test('selectConverter adds modbusValue to statePayload', () => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const specEntity: ImodbusEntity = {
    id: 1,
    modbusValue: [3],
    mqttValue: 'Some Text',
    identified: 1,
    mqttname: 'selectTest',
    converter: 'select',
    readonly: false,
    registerType: ModbusRegisterType.HoldingRegister,
    modbusAddress: 44,
    converterParameters: {
      options: [{ key: 3, name: 'Some Text' }],
    },
  }
  const spec: ImodbusSpecification = { entities: [specEntity] } as any as ImodbusSpecification
  const sl = new Slave(0, { slaveid: 0 }, Config.getConfiguration().mqttbasetopic)
  sl.getStatePayload(spec.entities)
  const payload = JSON.parse(sl.getStatePayload(spec.entities))
  expect(payload.modbusValues).toBeDefined()
  expect(payload.modbusValues.selectTest).toBe(3)
})
test('onCommandTopic', () => {
  Config.setFakeModbus(true)
  Config['config'].mqttusehassio = false
  const rc = msub1['onMqttCommandMessage']('m2m/set/0s1/e1/modbusValues', Buffer.from('[3]', 'utf8'))
  expect(rc).toBe('Modbus [3]')
})

test('onMessage TriggerPollTopic from this app', async () => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  const fake = new MdFakeMqtt(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])
  const sl = new Slave(0, { slaveid: 3 }, Config.getConfiguration().mqttbasetopic)
  fake.fakeMode = FakeModes.Poll
  await sub['onMqttMessage'](sl.getTriggerPollTopic(), Buffer.from(' '))
    .then(() => {
      expect(fake.isAsExpected).toBeTruthy()
    })
    .catch((e) => {
      console.log('Error' + e.message)
      expect(false).toBeTruthy()
    })
})

class FakeMqttSendCommandTopic extends FakeMqtt {
  public override publish(topic: string, message: Buffer, opts?: unknown, callback?: (err?: Error) => void): void {
    if (topic.endsWith('/state/')) {
      expect(message.length).not.toBe(0)
      this.isAsExpected = true
    }
    debug('publish: ' + topic + '\n' + message)
    const cb = typeof opts === 'function' ? (opts as (err?: Error) => void) : callback
    if (cb) cb()
  }
}
function copySubscribedSlaves(toA: Slave[], fromA: Slave[]) {
  fromA.forEach((s) => {
    ConfigBus.addSpecification(s['slave'])
    toA.push(s.clone())
  })
}
test.skip('onMessage SendEntityCommandTopic from this app', async () => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])
  const fake = new FakeMqttSendCommandTopic(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  const bus = Bus.getBus(0)
  const slave = structuredClone(bus!.getSlaveBySlaveId(1))
  ConfigBus.addSpecification(slave!)
  // Ensure entity index exists and is writable/select
  const enArr = (slave!.specification!.entities = slave!.specification!.entities || [])
  const idx = 2
  if (!enArr[idx]) {
    enArr[idx] = {
      id: 999,
      mqttname: 'temp',
      converter: 'select',
      modbusAddress: 0,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: false,
      modbusValue: [],
      mqttValue: '',
      identified: 0,
      converterParameters: { optionModbusValues: [1] },
    } as any
  }
  ;(slave!.specification!.entities[idx] as any).converter = 'select'
  const spec = slave!.specification!
  const sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  slave!.specification!.entities[idx].readonly = false
  const oldwriteEntityMqtt = Modbus.writeEntityMqtt
  const writeEntityMqttMock = vi.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityMqtt = writeEntityMqttMock as any
  const en: any = spec!.entities[idx]
  // Normalize topic: some paths include a trailing slash, strip it to match subscription lookup
  const entityCmdTopic = sl.getEntityCommandTopic(en)!.commandTopic!.replace(/\/$/, '')
  // For select entities, use an allowed option key
  await sub['onMqttMessage'](entityCmdTopic, Buffer.from('1'))
    .then(() => {
      expect(fake.isAsExpected).toBeTruthy()
      expect(writeEntityMqttMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
    })
})
test.skip('onMessage SendCommandTopic from this app', async () => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  const fake = new FakeMqttSendCommandTopic(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  const oldwriteEntityMqtt = Modbus.writeEntityMqtt
  const writeEntityMqttMock = vi.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityMqtt = writeEntityMqttMock as any

  conn['connectMqtt'] = function () {
    conn['onConnect'](conn['client']!)
  }
  const bus = Bus.getBus(0)
  const slave = structuredClone(bus!.getSlaveBySlaveId(1))
  ConfigBus.addSpecification(slave!)
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])

  const sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  const idx = 2
  const enArr = (slave!.specification!.entities = slave!.specification!.entities || [])
  if (!enArr[idx]) {
    enArr[idx] = {
      id: 999,
      mqttname: 'temp',
      converter: 'select',
      modbusAddress: 0,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: false,
      modbusValue: [],
      mqttValue: '',
      identified: 0,
      converterParameters: { optionModbusValues: [1] },
    } as any
  }
  slave!.specification!.entities[idx].readonly = false
  const cmdTopic = sl.getCommandTopic()!.replace(/\/$/, '')
  await sub['onMqttMessage'](cmdTopic, Buffer.from('{ "hotwatertargettemperature": 20.2 }'))
    .then(() => {
      expect(writeEntityMqttMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt
      expect(fake.isAsExpected).toBeTruthy()
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
    })
})
test.skip('onMessage SendCommand with modbusValues', async () => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])
  const fake = new FakeMqttSendCommandTopic(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  const oldwriteEntityMqtt = Modbus.writeEntityMqtt
  const writeEntityModbusMock = vi.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityModbus = writeEntityModbusMock as any

  conn['connectMqtt'] = function () {
    conn['onConnect'](conn['client']!)
  }
  const bus = Bus.getBus(0)
  const slave = structuredClone(bus!.getSlaveBySlaveId(1))
  ConfigBus.addSpecification(slave!)
  const sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  const topicCandidate = sl.getCommandTopic()
  const cmdTopic2 = (topicCandidate ? topicCandidate.replace(/\/$/, '') : sl.getCommandTopic())!
  await sub['onMqttMessage'](cmdTopic2, Buffer.from('{ "modbusValues": { "operatingmode": 2 }}'))
    .then(() => {
      expect(writeEntityModbusMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt
      expect(fake.isAsExpected).toBeTruthy()
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
    })
})

// test('onAddSlave/onUpdateSlave/onDeleteSlave', (done) => {
//   expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
//   let conn = new MqttConnector()
//   let mdl = new MqttDiscover(conn)
//   copySubscribedSlaves(mdl['subscribedSlaves'], msub1['subscribedSlaves'])
//   let slaveCount = mdl['subscribedSlaves'].length
//   let fake: FakeMqtt = new FakeMqttAddSlaveTopic(mdl, FakeModes.Poll)
//   conn['client'] = fake as any as MqttClient
//   conn['connectMqtt'] = function (undefined) {
//     conn['onConnect'](conn['client']!)
//   }
//   let spec = ConfigSpecification['specifications'].find((s: Ispecification) => s.filename == 'deyeinverterl') as Ispecification
//   let slave: Islave = { slaveid: 7, specificationid: 'deyeinverterl', specification: spec as any, name: 'wl2', rootTopic: 'wl2' }
//   mdl['onUpdateSlave'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic))
//     .then(() => {
//       expect(mdl['subscribedSlaves'].length).toBe(slaveCount + 1)
//       expect(fake.isAsExpected).toBeTruthy()
//       let s1 = mdl['subscribedSlaves'].find((s) => s.getSlaveId() == 7)!.clone()
//       spec = ConfigSpecification['specifications'].find((s: Ispecification) => s.filename == s1.getSpecificationId()!) as any
//       let oldSpec = structuredClone(spec)
//       // delete an entity

//       let s3 = s1.clone()
//       ConfigBus.addSpecification(s3['slave'])
//       s3['slave'].specification.entities.splice(0, 1)
//       fake = new FakeMqttDeleteEntitySlave(mdl, FakeModes.Poll)
//       mdl['client'] = fake as any as MqttClient
//       // onUpdateSlave with removed entity
//       mdl['onUpdateSlave'](s3).then(() => {
//         expect(fake.isAsExpected).toBeTruthy()
//         expect(mdl['subscribedSlaves'].find((s) => s.getSlaveId() == 7)!.getSpecification()!.entities.length).toBe(1)
//         // onUpdateSlave with added entity
//         let s2 = s3.clone()
//         s2.getSpecification()!.entities.push(numberTest)
//         fake = new FakeMqttAddEntitySlave(mdl, FakeModes.Poll)
//         mdl['client'] = fake as any as MqttClient
//         mdl['onUpdateSlave'](s2).then(() => {
//           expect(fake.isAsExpected).toBeTruthy()
//           expect(mdl['subscribedSlaves'].find((s) => s.getSlaveId() == 7)!.getSpecification()!.entities.length).toBe(2)
//           fake = new FakeMqttDeleteSlaveTopic(mdl, FakeModes.Poll)
//           mdl['client'] = fake as any as MqttClient
//           mdl['onDeleteSlave'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic))
//             .then(() => {
//               expect(mdl['subscribedSlaves'].length).toBe(slaveCount)
//               expect(fake.isAsExpected).toBeTruthy()
//               done()
//             })
//             .catch((e) => {
//               debug(e.message)
//               done()
//             })
//         })
//       })
//     })
//     .catch((e) => {
//       debug(e.message)
//       done()
//     })
// })

// Issue #228: Variable Property values (serial_number, sw_version, hw_version) are
// only available after the first Modbus poll. Initial discovery runs before polling,
// so without the post-poll republish these device fields would stay empty forever.
function buildDeviceVariableSpec(sn?: string, swv?: string, hwv?: string): ImodbusSpecification {
  const serialEntity: ImodbusEntity = {
    id: 10,
    mqttname: 'sn',
    variableConfiguration: { targetParameter: VariableTargetParameters.deviceSerialNumber },
    converter: 'text',
    modbusValue: [],
    mqttValue: sn as any,
    identified: 1,
    converterParameters: { stringlength: 12 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    modbusAddress: 10,
  }
  const swVersionEntity: ImodbusEntity = {
    id: 11,
    mqttname: 'swv',
    variableConfiguration: { targetParameter: VariableTargetParameters.deviceSWversion },
    converter: 'text',
    modbusValue: [],
    mqttValue: swv as any,
    identified: 1,
    converterParameters: { stringlength: 8 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    modbusAddress: 11,
  }
  const hwVersionEntity: ImodbusEntity = {
    id: 12,
    mqttname: 'hwv',
    variableConfiguration: { targetParameter: VariableTargetParameters.deviceHWversion },
    converter: 'text',
    modbusValue: [],
    mqttValue: hwv as any,
    identified: 1,
    converterParameters: { stringlength: 8 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    modbusAddress: 12,
  }
  const power: ImodbusEntity = {
    id: 13,
    mqttname: 'power',
    converter: 'number',
    modbusValue: [],
    mqttValue: '42',
    identified: 1,
    converterParameters: { uom: 'W' },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    modbusAddress: 13,
  }
  const s = {
    filename: 'issue228',
    manufacturer: 'Acme',
    model: 'X1',
    i18n: [{ lang: 'en', texts: [{ textId: 'name', text: 'Acme Device' }, { textId: 'e13', text: 'Power' }] }],
    entities: [serialEntity, swVersionEntity, hwVersionEntity, power],
  } as any as ImodbusSpecification
  return s
}

test('issue #228: discovery device.serial_number/sw_version/hw_version empty when mqttValue undefined', () => {
  const conn = new MqttConnector()
  const disc = new MqttDiscover(conn, msub1)
  const s = buildDeviceVariableSpec(undefined, undefined, undefined)
  const sl = new Slave(
    0,
    { slaveid: 42, specificationid: 'issue228', specification: s as any } as Islave,
    Config.getConfiguration().mqttbasetopic
  )
  const payloads = disc['generateDiscoveryPayloads'](sl, s)
  // only the numeric 'power' entity (no variableConfiguration) generates a payload
  expect(payloads.length).toBe(1)
  const payload = JSON.parse(payloads[0].payload as string)
  expect(payload.device.serial_number).toBeUndefined()
  expect(payload.device.sw_version).toBeUndefined()
  expect(payload.device.hw_version).toBeUndefined()
})

test('issue #228: hw_version is written when deviceHWversion entity has mqttValue', () => {
  const conn = new MqttConnector()
  const disc = new MqttDiscover(conn, msub1)
  const s = buildDeviceVariableSpec('SN-001', '1.2.3', 'RevB')
  const sl = new Slave(
    0,
    { slaveid: 43, specificationid: 'issue228', specification: s as any } as Islave,
    Config.getConfiguration().mqttbasetopic
  )
  const payloads = disc['generateDiscoveryPayloads'](sl, s)
  expect(payloads.length).toBe(1)
  const payload = JSON.parse(payloads[0].payload as string)
  expect(payload.device.serial_number).toBe('SN-001')
  expect(payload.device.sw_version).toBe('1.2.3')
  expect(payload.device.hw_version).toBe('RevB')
})

test('issue #228: republishDiscoveryIfChanged publishes delta after first poll', () => {
  const conn = new MqttConnector()
  const disc = new MqttDiscover(conn, msub1)
  const published: { topic: string; payload: string }[] = []
  conn.getMqttClient = function (cb: (c: MqttClient) => void) {
    cb({
      publish: (topic: string, payload: Buffer | string) => {
        published.push({ topic, payload: payload.toString() })
      },
    } as any as MqttClient)
  }

  // initial state: values not yet polled → empty device fields
  const emptySpec = buildDeviceVariableSpec(undefined, undefined, undefined)
  const islave: Islave = { slaveid: 44, specificationid: 'issue228', specification: emptySpec as any }
  const sl = new Slave(0, islave, Config.getConfiguration().mqttbasetopic)

  // prime the cache as if onUpdateSlave had just published empty payloads
  const emptyPayloads = disc['generateDiscoveryPayloads'](sl, emptySpec)
  for (const tp of emptyPayloads) {
    disc['lastDiscoveryPayloads'].set(tp.topic, tp.payload.toString())
  }

  // now simulate "first poll completed": values appear on the live spec
  islave.specification!.entities[0].mqttValue = 'SN-REAL' as any
  islave.specification!.entities[1].mqttValue = '2.0.0' as any
  islave.specification!.entities[2].mqttValue = 'RevC' as any

  disc.republishDiscoveryIfChanged(sl)

  expect(published.length).toBe(1)
  const payload = JSON.parse(published[0].payload)
  expect(payload.device.serial_number).toBe('SN-REAL')
  expect(payload.device.sw_version).toBe('2.0.0')
  expect(payload.device.hw_version).toBe('RevC')
})

test('issue #228: configuration_url is published when slave has configurationUrl', () => {
  const conn = new MqttConnector()
  const disc = new MqttDiscover(conn, msub1)
  const s = buildDeviceVariableSpec('SN', '1.0', 'A')
  const sl = new Slave(
    0,
    {
      slaveid: 46,
      specificationid: 'issue228',
      specification: s as any,
      configurationUrl: 'https://192.168.1.100:8443',
    } as Islave,
    Config.getConfiguration().mqttbasetopic
  )
  const payloads = disc['generateDiscoveryPayloads'](sl, s)
  expect(payloads.length).toBe(1)
  const payload = JSON.parse(payloads[0].payload as string)
  expect(payload.device.configuration_url).toBe('https://192.168.1.100:8443')
})

test('issue #228: configuration_url is omitted when slave has no configurationUrl', () => {
  const conn = new MqttConnector()
  const disc = new MqttDiscover(conn, msub1)
  const s = buildDeviceVariableSpec('SN', '1.0', 'A')
  const sl = new Slave(
    0,
    { slaveid: 47, specificationid: 'issue228', specification: s as any } as Islave,
    Config.getConfiguration().mqttbasetopic
  )
  const payloads = disc['generateDiscoveryPayloads'](sl, s)
  expect(payloads.length).toBe(1)
  const payload = JSON.parse(payloads[0].payload as string)
  expect(payload.device.configuration_url).toBeUndefined()
})

test('array entity: value_template uses the raw json path, object_id is sanitized', () => {
  const conn = new MqttConnector()
  const disc = new MqttDiscover(conn, msub1)
  const arrEntity: ImodbusEntity = {
    id: 20,
    mqttname: 'meters[0].obis',
    converter: 'number',
    modbusValue: [],
    mqttValue: '5',
    identified: 1,
    converterParameters: { uom: 'W' },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    modbusAddress: 20,
  }
  const flatEntity: ImodbusEntity = {
    id: 21,
    mqttname: 'battery_in',
    converter: 'number',
    modbusValue: [],
    mqttValue: '1',
    identified: 1,
    converterParameters: { uom: 'W' },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    modbusAddress: 21,
  }
  const s = {
    filename: 'arrtest',
    manufacturer: 'Acme',
    model: 'X',
    i18n: [{ lang: 'en', texts: [{ textId: 'name', text: 'Arr' }] }],
    entities: [arrEntity, flatEntity],
  } as any as ImodbusSpecification
  const sl = new Slave(0, { slaveid: 50, specificationid: 'arrtest', specification: s as any } as Islave, Config.getConfiguration().mqttbasetopic)
  const payloads = disc['generateDiscoveryPayloads'](sl, s).map((p) => JSON.parse(p.payload as string))
  const arr = payloads.find((p) => (p.value_template as string).includes('meters'))
  const flat = payloads.find((p) => p.object_id === 'battery_in')
  expect(arr.value_template).toBe('{{ value_json.meters[0].obis }}')
  expect(arr.object_id).toBe('meters_0_obis')
  // flat entity behaves exactly as before
  expect(flat.value_template).toBe('{{ value_json.battery_in }}')
})

test('root array entity: value_template has no leading dot', () => {
  const conn = new MqttConnector()
  const disc = new MqttDiscover(conn, msub1)
  const rootArr: ImodbusEntity = {
    id: 22,
    mqttname: '[0].obis',
    converter: 'number',
    modbusValue: [],
    mqttValue: '5',
    identified: 1,
    converterParameters: { uom: 'W' },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    modbusAddress: 22,
  }
  const s = {
    filename: 'rootarrtest',
    manufacturer: 'Acme',
    model: 'X',
    i18n: [{ lang: 'en', texts: [{ textId: 'name', text: 'RootArr' }] }],
    entities: [rootArr],
  } as any as ImodbusSpecification
  const sl = new Slave(0, { slaveid: 51, specificationid: 'rootarrtest', specification: s as any } as Islave, Config.getConfiguration().mqttbasetopic)
  const payload = JSON.parse(disc['generateDiscoveryPayloads'](sl, s)[0].payload as string)
  expect(payload.value_template).toBe('{{ value_json[0].obis }}')
  expect(payload.object_id).toBe('0_obis')
})

test('issue #228: republishDiscoveryIfChanged is a no-op when nothing changed', () => {
  const conn = new MqttConnector()
  const disc = new MqttDiscover(conn, msub1)
  let publishCount = 0
  conn.getMqttClient = function (cb: (c: MqttClient) => void) {
    cb({
      publish: () => {
        publishCount++
      },
    } as any as MqttClient)
  }

  const s = buildDeviceVariableSpec('SN-1', '1.0', 'A')
  const sl = new Slave(
    0,
    { slaveid: 45, specificationid: 'issue228', specification: s as any } as Islave,
    Config.getConfiguration().mqttbasetopic
  )
  // prime the cache with the exact same payloads we will generate next
  const initial = disc['generateDiscoveryPayloads'](sl, s)
  for (const tp of initial) {
    disc['lastDiscoveryPayloads'].set(tp.topic, tp.payload.toString())
  }

  disc.republishDiscoveryIfChanged(sl)
  expect(publishCount).toBe(0)
})
