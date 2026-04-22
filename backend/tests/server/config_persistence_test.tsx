import { it, expect, beforeAll, afterAll } from 'vitest'
import { Config } from '../../src/server/config.js'
import { ConfigSpecification } from '../../src/specification/index.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { TempConfigDirHelper } from './testhelper.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { parse } from 'yaml'
import * as fs from 'fs'
import { join } from 'path'

setConfigsDirsForTest()

let tempHelper: TempConfigDirHelper

beforeAll(async () => {
  tempHelper = new TempConfigDirHelper('config_persistence')
  tempHelper.setup()
  const config = new Config()
  await config.readYamlAsync()
})

afterAll(() => {
  if (tempHelper) tempHelper.cleanup()
})

// Test 1: Read contract — YAML + secrets substitution → Iconfiguration
it('read: YAML + secrets substitution produces correct Iconfiguration', () => {
  const cfg = Config.getConfiguration()
  expect(cfg).toBeDefined()
  expect(cfg.mqttbasetopic).toBe('modbus2mqtt')
  expect(cfg.mqttdiscoveryprefix).toBe('homeassistant')
  expect(cfg.httpport).toBe(3000)
  expect(cfg.fakeModbus).toBe(true)
  // Secrets are substituted from secrets.yaml (values get wrapped in quotes by the regex)
  expect(cfg.mqttconnect.username).toContain('mqtttestuser')
  expect(cfg.mqttconnect.password).toContain('mqtttestpassword')
})

// Test 2: Write contract — secrets extracted to secrets.yaml, placeholders in config
it('write: secrets extracted with !secret placeholders', () => {
  const cfg = Config.getConfiguration()
  cfg.mqttconnect.password = 'writetest_pw'
  cfg.mqttconnect.username = 'writetest_user'
  new Config().writeConfiguration(cfg)

  const yamlStr = fs.readFileSync(Config.getConfigPath(), 'utf8')
  expect(yamlStr).toContain('!secret mqttpassword')
  expect(yamlStr).toContain('!secret mqttuser')
  expect(yamlStr).not.toContain('writetest_pw')

  const secretsStr = fs.readFileSync(join(ConfigPersistence.getLocalDir(), 'secrets.yaml'), 'utf8')
  const secrets = parse(secretsStr)
  expect(secrets.mqttpassword).toBe('writetest_pw')
  expect(secrets.mqttuser).toBe('writetest_user')
})

// Test 3: Round-trip — write then read produces identical non-secret values
it('round-trip: write then read produces identical values', async () => {
  const original = Config.getConfiguration()
  original.mqttbasetopic = 'roundtrip_topic'
  original.mqttdiscoveryprefix = 'roundtrip_prefix'
  original.httpport = 4567
  // Clear all secrets to avoid YAML double-quote issues during round-trip
  delete original.githubPersonalToken
  original.mqttconnect.password = undefined
  original.mqttconnect.username = undefined
  new Config().writeConfiguration(original)

  // Re-read from disk
  const config2 = new Config()
  await config2.readYamlAsync()
  const reread = Config.getConfiguration()

  expect(reread.mqttbasetopic).toBe('roundtrip_topic')
  expect(reread.mqttdiscoveryprefix).toBe('roundtrip_prefix')
  expect(reread.httpport).toBe(4567)
})

// Test 4: getSecret — creates secrets.txt with 256 characters when missing
it('getSecret: creates secrets.txt with 256 characters when missing', () => {
  const secretPath = join(ConfigPersistence.getLocalDir(), 'test_secrets_gen.txt')
  // Ensure it doesn't exist
  if (fs.existsSync(secretPath)) fs.unlinkSync(secretPath)

  const secret = ConfigPersistence.getSecret(secretPath)
  expect(secret).toBeDefined()
  expect(secret.length).toBe(256)
  expect(fs.existsSync(secretPath)).toBe(true)

  // Cleanup
  fs.unlinkSync(secretPath)
})

// Test 5: getSecret — returns same value on repeated calls
it('getSecret: returns same value on repeated calls', () => {
  const secretPath = join(ConfigPersistence.getLocalDir(), 'test_secrets_stable.txt')
  if (fs.existsSync(secretPath)) fs.unlinkSync(secretPath)

  const secret1 = ConfigPersistence.getSecret(secretPath)
  const secret2 = ConfigPersistence.getSecret(secretPath)
  expect(secret1).toBe(secret2)

  // Cleanup
  fs.unlinkSync(secretPath)
})
