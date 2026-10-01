import { expect, it, beforeAll, afterAll } from 'vitest'
import { Config } from '../../src/server/config.js'
import { ModbusAutoDiscover } from '../../src/server/ModbusAutoDiscover.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { ConfigTestHelper, TempConfigDirHelper } from './testhelper.js'

setConfigsDirsForTest()

let configTestHelper: ConfigTestHelper
let tempHelper: TempConfigDirHelper

beforeAll(async () => {
  tempHelper = new TempConfigDirHelper('modbus_autodiscover_test')
  tempHelper.setup()
  configTestHelper = new ConfigTestHelper('modbus-autodiscover-test')
  configTestHelper.setup()
})

afterAll(() => {
  ModbusAutoDiscover.resetInstance()
  configTestHelper.restore()
  if (tempHelper) tempHelper.cleanup()
})

it('getDiscoveredServers returns empty when nothing discovered', () => {
  const ad = ModbusAutoDiscover.getInstance()
  expect(ad.getDiscoveredServers()).toEqual([])
})

it('blacklistServer persists the host:port to config', () => {
  const ad = ModbusAutoDiscover.getInstance()
  ad.blacklistServer('10.0.0.1', 502)
  const cfg = Config.getConfiguration()
  expect(cfg.modbusAutoDiscoverBlacklist).toContain('10.0.0.1:502')
})

it('blacklistServer filters discovered servers', () => {
  const ad = ModbusAutoDiscover.getInstance()
  // inject a discovered server manually
  ;(ad as any).discovered = [
    { name: 'a', host: '10.0.0.1', port: 502 },
    { name: 'b', host: '10.0.0.2', port: 502 },
  ]
  const before = ad.getDiscoveredServers()
  expect(before.some((s) => s.host === '10.0.0.1')).toBe(false) // blacklisted in prior test
  expect(before.some((s) => s.host === '10.0.0.2')).toBe(true)
})

// ---- Endpoint fallback (mbusd:502 / modbus:502) ----
it('tcpProbe returns true for an open port and false for a closed one', async () => {
  const ad = ModbusAutoDiscover.getInstance()
  // open listener on an ephemeral port
  const net = require('net')
  const srv = net.createServer(() => {})
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  const port = (srv.address() as { port: number }).port
  try {
    expect(await (ad as any).tcpProbe('127.0.0.1', port, 1500)).toBe(true)
    expect(await (ad as any).tcpProbe('127.0.0.1', 59999, 500)).toBe(false)
  } finally {
    srv.close()
  }
})

it('knownEndpoints includes mbusd and modbus on port 502', async () => {
  const ad = ModbusAutoDiscover.getInstance()
  const eps = (ad as any).knownEndpoints()
  expect(eps).toEqual([
    { host: 'mbusd', port: 502 },
    { host: 'modbus', port: 502 },
  ])
})

it('probeKnownEndpoints uses the hostname as the connection host', async () => {
  const ad = ModbusAutoDiscover.getInstance()
  ;(ad as any).tcpProbe = async () => true
  // Stub the injectable dns: both mbusd and modbus resolve to 10.0.0.5
  ;(ad as any).dns = { lookup: async (h: string) => [{ address: '10.0.0.5' }] }
  const rc = await (ad as any).probeKnownEndpoints()
  expect(rc.some((s: any) => s.host === 'mbusd' && s.port === 502)).toBe(true)
  expect(rc.some((s: any) => s.host === 'modbus' && s.port === 502)).toBe(true)
  // host is the hostname, NOT the resolved IP
  expect(rc.every((s: any) => s.host !== '10.0.0.5')).toBe(true)
})

// ---- mDNS hostname preference ----
it('preferHostname uses the SRV hostname when available, else the IP', async () => {
  const ad = ModbusAutoDiscover.getInstance()
  // SRV hostname present (not an IP) -> used
  expect((ad as any).preferHostname('mbusd', ['10.0.0.5'])).toBe('mbusd')
  expect((ad as any).preferHostname('mosquitto.local', ['10.0.0.6'])).toBe('mosquitto')
  // host is an IP literal -> fall back to addresses
  expect((ad as any).preferHostname('10.9.9.9', ['10.9.9.9'])).toBe('10.9.9.9')
  expect((ad as any).preferHostname('localhost', ['127.0.0.1'])).toBe('127.0.0.1')
  // no host, no addresses -> localhost
  expect((ad as any).preferHostname('', undefined)).toBe('localhost')
})
