import { expect, it, beforeAll, afterAll } from 'vitest'
import { ModbusAutoDiscover } from '../../src/server/ModbusAutoDiscover.js'
import { subnetCandidates, scanNamedHosts } from '../../src/server/NetworkScanner.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { ConfigTestHelper, TempConfigDirHelper } from './testhelper.js'

setConfigsDirsForTest()

let configTestHelper: ConfigTestHelper
let tempHelper: TempConfigDirHelper

beforeAll(async () => {
  tempHelper = new TempConfigDirHelper('networkscanner_test')
  tempHelper.setup()
  configTestHelper = new ConfigTestHelper('networkscanner-test')
  configTestHelper.setup()
})

afterAll(() => {
  ModbusAutoDiscover.resetInstance()
  configTestHelper.restore()
  if (tempHelper) tempHelper.cleanup()
})

// ---- subnetCandidates (pure) ----
it('subnetCandidates enumerates the /24 for a single interface and skips own IP', () => {
  const inf = [{ address: '172.18.0.2', netmask: '255.255.255.0', family: 'IPv4', internal: false }]
  const cands = subnetCandidates(inf as any)
  expect(cands.length).toBe(253) // 254 usable - own IP
  expect(cands).not.toContain('172.18.0.2')
  expect(cands).toContain('172.18.0.3')
  expect(cands).toContain('172.18.0.254')
  // every candidate is a /24-member (base .0 and broadcast .255 excluded by construction)
  expect(cands.every((c) => c.startsWith('172.18.0.') && !c.endsWith('.0') && !c.endsWith('.255'))).toBe(true)
})

it('subnetCandidates handles a /16 netmask', () => {
  const inf = [{ address: '10.0.0.5', netmask: '255.255.0.0', family: 'IPv4', internal: false }]
  const cands = subnetCandidates(inf as any)
  // /16 => 65534 usable, but we cap at DEFAULT_MAX_HOSTS_PER_SUBNET(254)+2
  expect(cands.length).toBeLessThanOrEqual(255)
  expect(cands).toContain('10.0.0.6')
  expect(cands).not.toContain('10.0.0.5')
})

it('subnetCandidates skips loopback/internal interfaces', () => {
  const inf = [
    { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true },
    { address: '::1', netmask: '', family: 'IPv6', internal: true },
  ]
  expect(subnetCandidates(inf as any)).toEqual([])
})

// ---- scanNamedHosts (reverse DNS + probe) ----
it('scanNamedHosts only returns hosts that answer the port', async () => {
  const reverse = async (ip: string) => {
    if (ip === '172.18.0.3') return ['mbusd.']
    if (ip === '172.18.0.4') return ['mosquitto.']
    throw new Error('NXDOMAIN')
  }
  // only mbusd listens on 502
  const tcpProbe = async (ip: string) => ip === '172.18.0.3'
  const interfaces = [{ address: '172.18.0.2', netmask: '255.255.255.0', family: 'IPv4', internal: false }]
  const found = await scanNamedHosts({ reverse } as any, tcpProbe, interfaces as any, 502, 254)
  expect(found).toEqual([{ host: 'mbusd', address: '172.18.0.3' }])
})

it('scanNamedHosts skips IPs whose reverse lookup fails', async () => {
  const reverse = async () => {
    throw new Error('NXDOMAIN')
  }
  const tcpProbe = async () => true // would be a bug to probe unresolvable IPs
  const interfaces = [{ address: '172.18.0.2', netmask: '255.255.255.0', family: 'IPv4', internal: false }]
  const found = await scanNamedHosts({ reverse } as any, tcpProbe, interfaces as any, 502, 254)
  expect(found).toEqual([])
})

it('scanNamedHosts resolves hostnames without trailing dot', async () => {
  const reverse = async (ip: string) => {
    if (ip === '172.18.0.9') return ['gateway.mbusd.']
    throw new Error('NXDOMAIN')
  }
  const tcpProbe = async () => true
  const interfaces = [{ address: '172.18.0.2', netmask: '255.255.255.0', family: 'IPv4', internal: false }]
  const found = await scanNamedHosts({ reverse } as any, tcpProbe, interfaces as any, 502, 254)
  expect(found).toEqual([{ host: 'gateway.mbusd', address: '172.18.0.9' }])
})

it('scanNamedHosts skips localhost names', async () => {
  const reverse = async () => ['localhost.']
  const tcpProbe = async () => true
  const interfaces = [{ address: '172.18.0.2', netmask: '255.255.255.0', family: 'IPv4', internal: false }]
  const found = await scanNamedHosts({ reverse } as any, tcpProbe, interfaces as any, 502, 254)
  expect(found).toEqual([])
})

// ---- ModbusAutoDiscover wiring (probeNamedHosts) ----
it('probeNamedHosts returns nothing when network scan is disabled', async () => {
  const ad = ModbusAutoDiscover.getInstance()
  ;(ad as any).networkScanEnabled = () => false
  expect(await (ad as any).probeNamedHosts()).toEqual([])
})

it('probeNamedHosts discovers a Docker-network Modbus host via reverse DNS + probe', async () => {
  const ad = ModbusAutoDiscover.getInstance()
  ;(ad as any).networkScanEnabled = () => true
  ;(ad as any).localInterfaces = () => [{ address: '172.18.0.2', netmask: '255.255.255.0', family: 'IPv4', internal: false }]
  ;(ad as any).dns = {
    reverse: async (ip: string) => {
      if (ip === '172.18.0.3') return ['mbusd.']
      throw new Error('NXDOMAIN')
    },
  }
  ;(ad as any).tcpProbe = async (ip: string) => ip === '172.18.0.3'
  const found = await (ad as any).probeNamedHosts()
  expect(found).toEqual([{ name: 'mbusd', host: 'mbusd', port: 502 }])
})
