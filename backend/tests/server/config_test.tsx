import { expect, it, afterAll, beforeAll } from 'vitest'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { getFileNameFromName } from '../../src/shared/specification/index.js'
import * as fs from 'fs'
import { setConfigsDirsForTest } from './configsbase.js'
import Debug from 'debug'
import { ConfigTestHelper, TempConfigDirHelper } from './testhelper.js'
setConfigsDirsForTest()
const debug = Debug('config_test')

// Test Helper Instanz
let configTestHelper: ConfigTestHelper
let tempHelper: TempConfigDirHelper

beforeAll(() => {
  return new Promise<void>((resolve, reject) => {
    tempHelper = new TempConfigDirHelper('config_test')
    tempHelper.setup()
    configTestHelper = new ConfigTestHelper('config-test')
    configTestHelper.setup()
    const config = new Config()
    config.readYamlAsync().then(
      () => {
        const cfg = Config.getConfiguration()
        expect((cfg as any).noentry).toBeUndefined()
        new Config().writeConfiguration(cfg)
        resolve()
      },
      (e) => reject(e)
    )
  })
})
afterAll(() => {
  configTestHelper.restore()
  if (tempHelper) tempHelper.cleanup()
})
it('getFileNameFromName remove non ascii characters', () => {
  const name = '/\\*& asdf+-_.'
  const fn = getFileNameFromName(name)
  debug(fn)
  expect(fn).toBe('asdf+-_.')
})

it('writeConfiguration change password ', () => {
  const cr = new Config()
  const cfg = Config.getConfiguration()
  const oldpassword = cfg.mqttconnect.password
  cfg.mqttconnect.password = 'testpassword'
  cr.writeConfiguration(cfg)
  expect(Config['config'].mqttconnect.password).toBe('testpassword')
  expect(cfg.mqttconnect.password).toBe('testpassword') // from secrets.yaml
  let cfgStr = fs.readFileSync(ConfigPersistence.getLocalDir() + '/modbus2mqtt.yaml').toString()
  expect(cfgStr).toContain('!secret ')
  cfg.mqttconnect.password = oldpassword
  cr.writeConfiguration(cfg)
  expect(Config['config'].mqttconnect.password).toBe(oldpassword)
  cfgStr = fs.readFileSync(ConfigPersistence.getLocalDir() + '/modbus2mqtt.yaml').toString()
  expect(cfgStr).toContain('!secret ')
  const secretsStr = fs.readFileSync(ConfigPersistence.getLocalDir() + '/secrets.yaml').toString()
  expect(secretsStr).toContain(oldpassword)
})

export const mqttService = {
  host: 'core-mosquitto',
  port: 1883,
  ssl: false,
  protocol: '3.1.1',
  username: 'addons',
  password: 'Euso6ahphaiWei9Aeli6Tei0si2paep5agethohboophe7vae9uc0iebeezohg8e',
  addon: 'core_mosquitto',
}
const mockedReason = 'Failed to get HASSIO MQTT Data'

let mockReject = false
function executeHassioGetRequest<T>(_url: string, next: (_dev: T) => void, reject: (error: any) => void): void {
  if (mockReject) reject(mockedReason)
  else next({ data: mqttService } as T)
}

it('getMqttConnectOptions: read connection from hassio', async () => {
  const oldExecute = Config['executeHassioGetRequest']
  Config['executeHassioGetRequest'] = executeHassioGetRequest
  process.env.HASSIO_TOKEN = 'test'
  const cfg = new Config()
  Config['config'].mqttusehassio = true
  await cfg.getMqttConnectOptions().then((_mqttData) => {
    expect(_mqttData.mqttserverurl).toBe('mqtt://core-mosquitto:1883')
    expect(_mqttData.username).toBe(mqttService.username)
    mockReject = true
    return cfg.getMqttConnectOptions().catch((reason) => {
      expect(reason).toBe(mockedReason)
      process.env.HASSIO_TOKEN = ''
      Config['executeHassioGetRequest'] = oldExecute
    })
  })
})
