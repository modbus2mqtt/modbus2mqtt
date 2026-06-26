import { Config } from '../../src/server/config.js'
import { ItopicAndPayloads, MqttDiscover } from '../../src/server/mqttdiscover.js'
import { MqttClient } from 'mqtt'
import { FakeModes, FakeMqtt, initBussesForTest, setConfigsDirsForTest } from './configsbase.js'
import { Bus } from '../../src/server/bus.js'
import { expect, test, beforeAll, afterAll } from 'vitest'
import { Slave, PollModes } from '../../src/shared/server/index.js'
import { ConfigBus } from '../../src/server/configbus.js'
import { MqttConnector } from '../../src/server/mqttconnector.js'
import { MqttPoller } from '../../src/server/mqttpoller.js'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions.js'
import { TempConfigDirHelper } from './testhelper.js'

const topic4Deletion = {
  topic: 'homeassistant/sensor/1s0/e1/topic4Deletion',
  payload: '',
  entityid: 1,
}

interface IfakeDiscovery {
  conn: MqttConnector
  mdl: MqttPoller
  msub: MqttSubscriptions
  md: MqttDiscover
  fake: FakeMqtt
}

function getFakeDiscovery(): IfakeDiscovery {
  const conn = new MqttConnector()
  const msub = new MqttSubscriptions(conn)
  const rc: IfakeDiscovery = {
    conn: conn,
    mdl: new MqttPoller(conn),
    msub: msub,
    md: new MqttDiscover(conn, msub),
    fake: new FakeMqtt(msub, FakeModes.Poll),
  }
  rc.conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(rc.fake as any as MqttClient)
  }
  rc.conn['client'] = rc.fake as any as MqttClient
  return rc
}
let fakeDiscovery: IfakeDiscovery

function copySubscribedSlaves(toA: Slave[], fromA: Slave[]) {
  fromA.forEach((s) => {
    ConfigBus.addSpecification(s['slave'])
    if (s['slave'] && s['slave'].specification && s['slave'].specification.entities)
      s['slave'].specification.entities.forEach((e: any) => {
        e.converter = 'select'
      })
    toA.push(s.clone())
  })
}
let tempHelper: TempConfigDirHelper
beforeAll(async () => {
  // Fix ModbusCache ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
  setConfigsDirsForTest()
  tempHelper = new TempConfigDirHelper('mqttpoller_test')
  tempHelper.setup()
  Config['config'] = {} as any
  const readConfig: Config = new Config()
  await readConfig.readYamlAsync()
  fakeDiscovery = getFakeDiscovery()
  initBussesForTest()
})
afterAll(() => {
  if (tempHelper) tempHelper.cleanup()
})

test('poll', async () => {
  const fd = getFakeDiscovery()
  copySubscribedSlaves(fd.msub['subscribedSlaves'], fakeDiscovery.msub['subscribedSlaves'])
  await fd.mdl['poll']!(Bus.getBus(0)!)
  expect(fd.fake.isAsExpected).toBeTruthy()
  expect(fd.mdl!['slavePollInfo'].size).toBeGreaterThan(0)
  let c = fd.mdl!['slavePollInfo'].values().next()
  expect(c.value!.count).toBeGreaterThan(0)
  fd.fake = new FakeMqtt(fd.msub!, FakeModes.Poll2)
  // second call should do nothing, because interval is too short
  fd.conn['client'] = fd.fake as any as MqttClient
  fd.fake.isAsExpected = true
  const m = new Map<number, ItopicAndPayloads>()
  m.set(1, topic4Deletion)
  const sl = new Slave(1, { slaveid: 0 }, Config.getConfiguration().mqttbasetopic)
  expect(fd.msub['subscribedSlaves'].length).toBeGreaterThan(3)
  fd.msub['subscribedSlaves'].push(sl)
  expect(fd.msub['subscribedSlaves'].length).toBeGreaterThan(3)
  await fd.mdl!['poll'](Bus.getBus(0)!)
  expect(fd.fake.isAsExpected).toBeTruthy()
  c = fd.mdl!['slavePollInfo'].values().next()
  fd.mdl!['slavePollInfo'].set(1, { count: 10000, processing: false })
  expect(c.value!.count).toBeGreaterThan(1)
  //call discovery explicitly
  fd.fake.isAsExpected = false
  fd.fake.fakeMode = FakeModes.Discovery
  await fd.mdl!['poll'](Bus.getBus(0)!)
})

test('poll with processing=true for all slaves', async () => {
  const fd = getFakeDiscovery()
  initBussesForTest()
  fd.mdl!['slavePollInfo'].set(1, { count: 0, processing: true })
  fd.mdl!['slavePollInfo'].set(2, { count: 0, processing: true })
  fd.mdl!['slavePollInfo'].set(3, { count: 0, processing: true })
  fd.fake.isAsExpected = false
  await fd.mdl!['poll']!(Bus.getBus(0)!)
  expect(fd.mdl!['slavePollInfo'].get(1)!.processing).toBeTruthy()
  expect(fd.fake.isAsExpected).toBeFalsy()
})

test('poll with processing= true for first Slave', async () => {
  const fd = getFakeDiscovery()
  fd.mdl!['slavePollInfo'].set(1, { count: 0, processing: true })
  fd.mdl!['slavePollInfo'].set(2, { count: 0, processing: false })
  fd.mdl!['slavePollInfo'].set(3, { count: 0, processing: false })
  fd.fake.isAsExpected = false
  await fd.mdl!['poll']!(Bus.getBus(0)!)
  expect(fd.mdl!['slavePollInfo'].get(1)!.processing).toBeTruthy()
  expect(fd.fake.isAsExpected).toBeTruthy()
})

test('cron pollSchedule bypasses the tick counter and fires once per minute', async () => {
  const fd = getFakeDiscovery()
  copySubscribedSlaves(fd.msub['subscribedSlaves'], fakeDiscovery.msub['subscribedSlaves'])

  const slaves = Bus.getBus(0)!.getSlaves()
  const target = slaves.find(
    (s) => s.pollMode != undefined && ![PollModes.noPoll, PollModes.trigger].includes(s.pollMode) && s.specification != undefined
  )
  expect(target).toBeDefined()
  const saved = target!.pollSchedule
  target!.pollSchedule = '* * * * *' // matches every minute

  try {
    fd.fake.isAsExpected = false
    fd.fake.fakeMode = FakeModes.Poll
    await fd.mdl['poll']!(Bus.getBus(0)!)

    const info = fd.mdl!['slavePollInfo'].get(target!.slaveid)
    expect(info).toBeDefined()
    expect(info!.count).toBe(0) // cron path used, fixed-interval counter untouched
    expect(info!.lastFiredMinute).toBeDefined()
    const firstMinute = info!.lastFiredMinute

    // Second poll within the same minute must not fire again (deduplicated).
    await fd.mdl['poll']!(Bus.getBus(0)!)
    const info2 = fd.mdl!['slavePollInfo'].get(target!.slaveid)
    expect(info2!.lastFiredMinute).toBe(firstMinute)
    expect(info2!.count).toBe(0)
  } finally {
    if (saved == undefined) delete target!.pollSchedule
    else target!.pollSchedule = saved
  }
})

test('invalid pollSchedule skips polling (does not fall back to the interval)', async () => {
  const fd = getFakeDiscovery()
  copySubscribedSlaves(fd.msub['subscribedSlaves'], fakeDiscovery.msub['subscribedSlaves'])

  const slaves = Bus.getBus(0)!.getSlaves()
  const target = slaves.find(
    (s) => s.pollMode != undefined && ![PollModes.noPoll, PollModes.trigger].includes(s.pollMode) && s.specification != undefined
  )
  expect(target).toBeDefined()
  const saved = target!.pollSchedule
  target!.pollSchedule = 'not a cron'

  try {
    fd.fake.isAsExpected = false
    fd.fake.fakeMode = FakeModes.Poll
    await fd.mdl['poll']!(Bus.getBus(0)!)
    const info = fd.mdl!['slavePollInfo'].get(target!.slaveid)
    expect(info).toBeDefined()
    expect(info!.count).toBe(0) // not polled via counter
    expect(info!.lastFiredMinute).toBeUndefined() // not polled via cron
    expect(info!.processing).toBe(false)
  } finally {
    if (saved == undefined) delete target!.pollSchedule
    else target!.pollSchedule = saved
  }
})

test('poll counter resets at threshold and allows re-polling', async () => {
  const fd = getFakeDiscovery()
  copySubscribedSlaves(fd.msub['subscribedSlaves'], fakeDiscovery.msub['subscribedSlaves'])

  // Initial poll at count 0
  await fd.mdl['poll']!(Bus.getBus(0)!)
  const pollInfo1 = fd.mdl!['slavePollInfo'].get(1)
  expect(pollInfo1).toBeDefined()
  expect(pollInfo1!.count).toBeGreaterThan(0)

  // Simulate reaching the threshold (default is 50)
  fd.mdl!['slavePollInfo'].set(1, { count: 50, processing: false })

  fd.fake.isAsExpected = false
  fd.fake.fakeMode = FakeModes.Poll

  await fd.mdl['poll']!(Bus.getBus(0)!)
  expect(fd.fake.isAsExpected).toBeTruthy()
  const pollInfo2 = fd.mdl!['slavePollInfo'].get(1)
  expect(pollInfo2).toBeDefined()
  expect(pollInfo2!.count).toBeGreaterThan(0)
  expect(pollInfo2!.count).toBeLessThan(50)
})
