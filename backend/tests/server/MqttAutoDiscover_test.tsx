import { expect, it, beforeAll, afterAll, vi } from 'vitest'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { MqttAutoDiscover } from '../../src/server/MqttAutoDiscover.js'
import { MqttConnector } from '../../src/server/mqttconnector.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { ConfigTestHelper, TempConfigDirHelper } from './testhelper.js'

setConfigsDirsForTest()

let configTestHelper: ConfigTestHelper
let tempHelper: TempConfigDirHelper

beforeAll(() => {
  tempHelper = new TempConfigDirHelper('mqtt_autodiscover_test')
  tempHelper.setup()
  configTestHelper = new ConfigTestHelper('mqtt-autodiscover-test')
  configTestHelper.setup()
})

afterAll(() => {
  MqttAutoDiscover.resetInstance()
  MqttConnector.resetInstance()
  configTestHelper.restore()
  if (tempHelper) tempHelper.cleanup()
})

it('isConfigured returns false when no mqttserverurl', async () => {
  const cfg = Config.getConfiguration()
  if (cfg.mqttconnect) cfg.mqttconnect.mqttserverurl = undefined as never
  const ad = MqttAutoDiscover.getInstance()
  // access private via any
  expect((ad as any).isConfigured()).toBe(false)
})

it('isConfigured returns true when mqttserverurl set', async () => {
  const cfg = Config.getConfiguration()
  cfg.mqttconnect = { mqttserverurl: 'mqtt://broker:1883' }
  new Config().writeConfiguration(cfg)
  const ad = MqttAutoDiscover.getInstance()
  expect((ad as any).isConfigured()).toBe(true)
})

it('persist writes the discovered mqttserverurl and resets the connector', async () => {
  const ad = MqttAutoDiscover.getInstance()
  const spyReset = vi.spyOn(MqttConnector, 'resetInstance')
  const cfg = Config.getConfiguration()
  cfg.mqttconnect = {}
  new Config().writeConfiguration(cfg)
  ;(ad as any).persist({ mqttserverurl: 'mqtt://found.local:1883' })
  const after = Config.getConfiguration()
  expect(after.mqttconnect.mqttserverurl).toBe('mqtt://found.local:1883')
  expect(spyReset).toHaveBeenCalled()
})

it('start() does not loop when a broker is already configured', async () => {
  const cfg = Config.getConfiguration()
  cfg.mqttconnect = { mqttserverurl: 'mqtt://already:1883' }
  new Config().writeConfiguration(cfg)
  const ad = MqttAutoDiscover.getInstance()
  const spyProbe = vi.spyOn(ad as any, 'probe').mockImplementation(() => {
    ;(ad as any).stop()
    return Promise.resolve()
  })
  ;(ad as any).running = false
  ad.start()
  // probe should have been called once (it short-circuits via stop() since configured)
  expect(spyProbe).toHaveBeenCalledTimes(1)
})
