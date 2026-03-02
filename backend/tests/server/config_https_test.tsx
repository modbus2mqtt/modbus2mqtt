import { expect, it, describe, afterEach, beforeAll } from 'vitest'
import { Config } from '../../src/server/config.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { TempConfigDirHelper } from './testhelper.js'

setConfigsDirsForTest()

let tempHelper: TempConfigDirHelper

beforeAll(() => {
  tempHelper = new TempConfigDirHelper('config_https_test')
  tempHelper.setup()
  const config = new Config()
  return config.readYamlAsync()
})

afterEach(() => {
  // Clean up env vars after each test
  delete process.env.MODBUS2MQTT_HTTPS_PORT
  delete process.env.HASSIO_TOKEN
  // Reset HTTPS config state to prevent leaking between tests
  const cfg = Config.getConfiguration()
  cfg.httpsPort = undefined
  cfg.httpsCertFile = undefined
  cfg.httpsKeyFile = undefined
  new Config().writeConfiguration(cfg)
})

import { afterAll } from 'vitest'
afterAll(() => {
  if (tempHelper) tempHelper.cleanup()
})

describe('HTTPS configuration', () => {
  it('should not set httpsPort by default', () => {
    const cfg = Config.getConfiguration()
    expect(cfg.httpsPort).toBeUndefined()
  })

  it('should set httpsPort from environment variable', () => {
    process.env.MODBUS2MQTT_HTTPS_PORT = '3443'
    const cfg = Config.getConfiguration()
    expect(cfg.httpsPort).toBe(3443)
  })

  it('should set default certificate filenames when httpsPort is configured', () => {
    process.env.MODBUS2MQTT_HTTPS_PORT = '3443'
    const cfg = Config.getConfiguration()
    expect(cfg.httpsCertFile).toBe('fullchain.pem')
    expect(cfg.httpsKeyFile).toBe('privkey.pem')
  })

  it('should ignore invalid MODBUS2MQTT_HTTPS_PORT values', () => {
    process.env.MODBUS2MQTT_HTTPS_PORT = 'notanumber'
    const cfg = Config.getConfiguration()
    expect(cfg.httpsPort).toBeUndefined()
  })

  it('should ignore zero or negative MODBUS2MQTT_HTTPS_PORT', () => {
    process.env.MODBUS2MQTT_HTTPS_PORT = '0'
    const cfg = Config.getConfiguration()
    expect(cfg.httpsPort).toBeUndefined()

    process.env.MODBUS2MQTT_HTTPS_PORT = '-1'
    const cfg2 = Config.getConfiguration()
    expect(cfg2.httpsPort).toBeUndefined()
  })

  it('should disable httpsPort in addon mode (HASSIO_TOKEN set)', () => {
    process.env.MODBUS2MQTT_HTTPS_PORT = '3443'
    process.env.HASSIO_TOKEN = 'some-token'
    const cfg = Config.getConfiguration()
    expect(cfg.httpsPort).toBeUndefined()
  })

  it('should preserve httpsPort from YAML config', () => {
    // Write config with httpsPort
    const cfg = Config.getConfiguration()
    cfg.httpsPort = 8443
    new Config().writeConfiguration(cfg)

    // Re-read and verify
    const cfg2 = Config.getConfiguration()
    expect(cfg2.httpsPort).toBe(8443)

    // Clean up: remove httpsPort
    cfg.httpsPort = undefined
    new Config().writeConfiguration(cfg)
  })

  it('should let env var override YAML httpsPort', () => {
    // Write config with httpsPort 8443
    const cfg = Config.getConfiguration()
    cfg.httpsPort = 8443
    new Config().writeConfiguration(cfg)

    // Env var should override
    process.env.MODBUS2MQTT_HTTPS_PORT = '9443'
    const cfg2 = Config.getConfiguration()
    expect(cfg2.httpsPort).toBe(9443)

    // Clean up
    cfg.httpsPort = undefined
    new Config().writeConfiguration(cfg)
  })

  it('should allow custom certificate filenames', () => {
    const cfg = Config.getConfiguration()
    cfg.httpsPort = 3443
    cfg.httpsCertFile = 'custom.crt'
    cfg.httpsKeyFile = 'custom.key'
    new Config().writeConfiguration(cfg)

    const cfg2 = Config.getConfiguration()
    expect(cfg2.httpsCertFile).toBe('custom.crt')
    expect(cfg2.httpsKeyFile).toBe('custom.key')

    // Clean up
    cfg.httpsPort = undefined
    cfg.httpsCertFile = undefined
    cfg.httpsKeyFile = undefined
    new Config().writeConfiguration(cfg)
  })
})
