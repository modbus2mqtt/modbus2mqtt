import { it, expect, describe, beforeAll, afterAll, jest } from '@jest/globals'
import * as fs from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Converters, IfileSpecification, ModbusRegisterType, VariableTargetParameters } from '../../src/shared/specification/index.js'
import { M2mSpecification } from '../../src/specification/index.js'
import { Islave, PollModes, Slave } from '../../src/shared/server/index.js'
import { ImodbusEntity, ImodbusSpecification } from '../../src/shared/specification/index.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { encryptSecret, decryptSecret } from '../../src/server/secureSecret.js'
import { HttpPush } from '../../src/server/httpPush.js'

// Minimal spec with one static 'value' entity (obis) and one numeric entity (obis_value).
function buildSpec(): IfileSpecification {
  return {
    filename: 'meter',
    status: 2,
    manufacturer: 'unknown',
    model: 'meter',
    files: [],
    i18n: [],
    testdata: {
      holdingRegisters: [{ address: 4, value: 234 }],
    },
    entities: [
      {
        id: 1,
        mqttname: 'obis',
        converter: 'value' as Converters,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        converterParameters: { value: '1-0:1.0.8' },
      },
      {
        id: 2,
        mqttname: 'obis_value',
        converter: 'number' as Converters,
        modbusAddress: 4,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        converterParameters: { multiplier: 1, offset: 0 },
      },
    ],
  } as unknown as IfileSpecification
}

describe('static value entity (obis)', () => {
  it('computes mqttValue for a value entity that has no modbus address', () => {
    const spec = buildSpec()
    const mspec = M2mSpecification.fileToModbusSpecification(spec)
    const obis = mspec.entities.find((e) => e.id == 1) as ImodbusEntity
    const obisValue = mspec.entities.find((e) => e.id == 2) as ImodbusEntity
    expect(obis.mqttValue).toBe('1-0:1.0.8')
    expect(obisValue.mqttValue).toBe(234)
  })
})

describe('Slave http push helpers', () => {
  const slaveCfg: Islave = {
    slaveid: 1,
    pollMode: PollModes.intervallHttpPushNoMqtt,
    httpPush: { url: 'https://example.com/readings/SN1', pushEntities: [1, 2] },
  }
  const entities: ImodbusEntity[] = [
    { id: 1, mqttname: 'obis', converter: 'value', readonly: true, mqttValue: '1-0:1.0.8' } as unknown as ImodbusEntity,
    { id: 2, mqttname: 'obis_value', converter: 'number', readonly: true, mqttValue: 234 } as unknown as ImodbusEntity,
    { id: 3, mqttname: 'other', converter: 'number', readonly: true, mqttValue: 99 } as unknown as ImodbusEntity,
  ]

  it('shouldPublishMqtt is false in HTTP-push-only mode', () => {
    const slave = new Slave(0, slaveCfg, 'm2m')
    expect(slave.shouldPublishMqtt()).toBe(false)
    expect(slave.hasHttpPush()).toBe(true)
  })

  it('getHttpPushPayload contains only selected entities', () => {
    const slave = new Slave(0, slaveCfg, 'm2m')
    const payload = JSON.parse(slave.getHttpPushPayload(entities)!)
    expect(payload).toEqual({ obis: '1-0:1.0.8', obis_value: 234 })
  })

  it('shouldPublishMqtt is true for normal interval mode', () => {
    const slave = new Slave(0, { slaveid: 1, pollMode: PollModes.intervall }, 'm2m')
    expect(slave.shouldPublishMqtt()).toBe(true)
    expect(slave.hasHttpPush()).toBe(false)
  })
})

describe('Slave.parseMqttPath / mqttNameToObjectId', () => {
  it('treats a flat name as a single key', () => {
    expect(Slave.parseMqttPath('obis')).toEqual([{ key: 'obis' }])
    expect(Slave.isStructuredMqttName('obis')).toBe(false)
  })
  it('parses a nested array path', () => {
    expect(Slave.parseMqttPath('meters[0].obis')).toEqual([{ key: 'meters' }, { index: 0 }, { key: 'obis' }])
  })
  it('parses a deep nested object path', () => {
    expect(Slave.parseMqttPath('a.b.c[0].key')).toEqual([
      { key: 'a' },
      { key: 'b' },
      { key: 'c' },
      { index: 0 },
      { key: 'key' },
    ])
  })
  it('parses a root array path', () => {
    expect(Slave.parseMqttPath('[0].obis')).toEqual([{ index: 0 }, { key: 'obis' }])
  })
  it('falls back to a flat key for malformed names', () => {
    expect(Slave.parseMqttPath('meters[].obis')).toEqual([{ key: 'meters[].obis' }])
    expect(Slave.parseMqttPath('m[x].o')).toEqual([{ key: 'm[x].o' }])
  })
  it('sanitizes object_id slugs', () => {
    expect(Slave.mqttNameToObjectId('meters[0].obis')).toBe('meters_0_obis')
    expect(Slave.mqttNameToObjectId('[0].obis')).toBe('0_obis')
    expect(Slave.mqttNameToObjectId('battery_in')).toBe('battery_in')
  })
})

describe('Slave.getStatePayload array support', () => {
  const slave = new Slave(0, { slaveid: 1, pollMode: PollModes.intervall }, 'm2m')
  function ent(id: number, mqttname: string, mqttValue: unknown, converter = 'number'): ImodbusEntity {
    return { id, mqttname, converter, readonly: true, mqttValue } as unknown as ImodbusEntity
  }

  it('keeps flat-only payloads identical to before', () => {
    const payload = JSON.parse(slave.getStatePayload([ent(1, 'obis', '1-0:1.0.8', 'value'), ent(2, 'obis_value', 234)]))
    expect(payload).toEqual({ obis: '1-0:1.0.8', obis_value: 234 })
  })

  it('builds a nested array next to flat scalars', () => {
    const payload = JSON.parse(
      slave.getStatePayload([
        ent(1, 'battery_in', 1200),
        ent(2, 'grid_out', 50),
        ent(3, 'meters[0].obis', '1-0:1.8.0', 'value'),
        ent(4, 'meters[0].obis_value', 234),
        ent(5, 'meters[1].obis', '1-0:2.8.0', 'value'),
        ent(6, 'meters[1].obis_value', 12),
      ])
    )
    expect(payload).toEqual({
      battery_in: 1200,
      grid_out: 50,
      meters: [
        { obis: '1-0:1.8.0', obis_value: 234 },
        { obis: '1-0:2.8.0', obis_value: 12 },
      ],
    })
  })

  it('builds a root-level array', () => {
    const payload = JSON.parse(
      slave.getStatePayload([
        ent(1, '[0].obis', '1-0:1.8.0', 'value'),
        ent(2, '[0].obis_value', 234),
        ent(3, '[1].obis', '1-0:2.8.0', 'value'),
      ])
    )
    expect(Array.isArray(payload)).toBe(true)
    expect(payload).toEqual([{ obis: '1-0:1.8.0', obis_value: 234 }, { obis: '1-0:2.8.0' }])
  })

  it('leaves a hole (null) for sparse indices', () => {
    const payload = JSON.parse(slave.getStatePayload([ent(1, 'meters[0].obis', 'a', 'value'), ent(2, 'meters[2].obis', 'c', 'value')]))
    expect(payload.meters.length).toBe(3)
    expect(payload.meters[1]).toBeNull()
  })

  it('keeps modbusValues flat keyed by full mqttname for array select entities', () => {
    const e = { id: 1, mqttname: 'meters[0].mode', converter: 'select', readonly: true, mqttValue: 'on', modbusValue: [3] } as unknown as ImodbusEntity
    const payload = JSON.parse(slave.getStatePayload([e]))
    expect(payload.meters[0].mode).toBe('on')
    expect(payload.modbusValues).toEqual({ 'meters[0].mode': 3 })
  })

  it('does not throw on conflicting flat + array under the same name', () => {
    expect(() => slave.getStatePayload([ent(1, 'meters', 1), ent(2, 'meters[0].x', 2)])).not.toThrow()
  })
})

describe('Slave.getHttpPushPayload array support', () => {
  const slaveCfg: Islave = { slaveid: 1, pollMode: PollModes.intervall, httpPush: { url: 'https://x', pushEntities: [3, 4] } }
  const slave = new Slave(0, slaveCfg, 'm2m')
  it('builds nested arrays only for pushed ids', () => {
    const entities: ImodbusEntity[] = [
      { id: 1, mqttname: 'battery_in', converter: 'number', readonly: true, mqttValue: 1200 } as unknown as ImodbusEntity,
      { id: 3, mqttname: 'meters[0].obis', converter: 'value', readonly: true, mqttValue: 'a' } as unknown as ImodbusEntity,
      { id: 4, mqttname: 'meters[0].obis_value', converter: 'number', readonly: true, mqttValue: 5 } as unknown as ImodbusEntity,
    ]
    const payload = JSON.parse(slave.getHttpPushPayload(entities)!)
    expect(payload).toEqual({ meters: [{ obis: 'a', obis_value: 5 }] })
  })
})

describe('Slave http push root + URL templating', () => {
  function ent(id: number, mqttname: string, mqttValue: unknown, converter = 'number'): ImodbusEntity {
    return { id, mqttname, converter, readonly: true, mqttValue } as unknown as ImodbusEntity
  }
  const orbisEntities: ImodbusEntity[] = [
    ent(1, 'orbis[0].orbis_key', '0-1:1.8.0', 'value'),
    ent(2, 'orbis[0].orbis_value', 100),
    ent(3, 'orbis[1].orbis_key', '0-2:1.8.0', 'value'),
    ent(4, 'orbis[1].orbis_value', 200),
  ]

  it('root selects only the subtree (the orbis array)', () => {
    const slave = new Slave(0, { slaveid: 1, httpPush: { url: 'https://x', pushEntities: [1, 2, 3, 4], root: 'orbis' } }, 'm2m')
    const payload = JSON.parse(slave.getHttpPushPayload(orbisEntities)!)
    expect(payload).toEqual([
      { orbis_key: '0-1:1.8.0', orbis_value: 100 },
      { orbis_key: '0-2:1.8.0', orbis_value: 200 },
    ])
  })

  it('returns null when root path is not present', () => {
    const slave = new Slave(0, { slaveid: 1, httpPush: { url: 'https://x', pushEntities: [1, 2, 3, 4], root: 'missing' } }, 'm2m')
    expect(slave.getHttpPushPayload(orbisEntities)).toBeNull()
  })

  it('without root returns the full object (regression)', () => {
    const slave = new Slave(0, { slaveid: 1, httpPush: { url: 'https://x', pushEntities: [1, 2, 3, 4] } }, 'm2m')
    const payload = JSON.parse(slave.getHttpPushPayload(orbisEntities)!)
    expect(payload).toEqual({
      orbis: [
        { orbis_key: '0-1:1.8.0', orbis_value: 100 },
        { orbis_key: '0-2:1.8.0', orbis_value: 200 },
      ],
    })
  })

  it('substitutes {{ serialnumber }} (a device variable) into the URL, url-encoded', () => {
    const sn = { id: 9, mqttname: 'serialnumber', converter: 'text', readonly: true, mqttValue: 'SN 1234/AB', variableConfiguration: { targetParameter: VariableTargetParameters.deviceSerialNumber } } as unknown as ImodbusEntity
    const slave = new Slave(0, { slaveid: 1, httpPush: { url: 'https://api/readings/{{ serialnumber }}', pushEntities: [1] } }, 'm2m')
    expect(slave.getResolvedHttpPushUrl([sn, ...orbisEntities])).toBe('https://api/readings/SN%201234%2FAB')
  })

  it('resolves a nested placeholder path', () => {
    const dev = ent(9, 'device.serialnumber', 'ABC', 'value')
    const slave = new Slave(0, { slaveid: 1, httpPush: { url: 'https://api/{{ device.serialnumber }}', pushEntities: [1] } }, 'm2m')
    expect(slave.getResolvedHttpPushUrl([dev])).toBe('https://api/ABC')
  })

  it('returns null when a URL placeholder cannot be resolved', () => {
    const slave = new Slave(0, { slaveid: 1, httpPush: { url: 'https://api/{{ serialnumber }}', pushEntities: [1] } }, 'm2m')
    expect(slave.getResolvedHttpPushUrl(orbisEntities)).toBeNull()
  })

  it('leaves a URL without placeholders unchanged', () => {
    const slave = new Slave(0, { slaveid: 1, httpPush: { url: 'https://api/static', pushEntities: [1] } }, 'm2m')
    expect(slave.getResolvedHttpPushUrl(orbisEntities)).toBe('https://api/static')
  })
})

// Exercises exactly what the backend poll process runs: mqttpoller calls HttpPush.pushState(slave, spec)
// after a Modbus read. We mock fetch and verify the resolved URL and the root-filtered body.
describe('HttpPush.pushState (poll process)', () => {
  let originalFetch: typeof globalThis.fetch
  let fetchMock: ReturnType<typeof jest.fn>
  beforeAll(() => {
    originalFetch = globalThis.fetch
  })
  afterAll(() => {
    globalThis.fetch = originalFetch
  })

  it('posts only the orbis array to a URL with the serial number substituted', async () => {
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, statusText: 'OK' }) as any)
    globalThis.fetch = fetchMock as any

    const serialnumber: ImodbusEntity = {
      id: 9,
      mqttname: 'serialnumber',
      converter: 'text',
      readonly: true,
      mqttValue: '1234ABC',
      variableConfiguration: { targetParameter: VariableTargetParameters.deviceSerialNumber },
    } as unknown as ImodbusEntity
    const mk = (id: number, mqttname: string, v: unknown, c = 'number'): ImodbusEntity =>
      ({ id, mqttname, converter: c, readonly: true, mqttValue: v }) as unknown as ImodbusEntity
    const spec = {
      entities: [
        serialnumber,
        mk(1, 'orbis[0].orbis_key', '0-1:1.8.0', 'value'),
        mk(2, 'orbis[0].orbis_value', 100),
        mk(3, 'orbis[1].orbis_key', '0-2:1.8.0', 'value'),
        mk(4, 'orbis[1].orbis_value', 200),
      ],
    } as unknown as ImodbusSpecification

    const slave = new Slave(
      0,
      {
        slaveid: 1,
        pollMode: PollModes.intervallHttpPushNoMqtt,
        httpPush: { url: 'https://api.example.com/readings/{{ serialnumber }}', root: 'orbis', pushEntities: [1, 2, 3, 4] },
      },
      'm2m'
    )

    await HttpPush.pushState(slave, spec)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toBe('https://api.example.com/readings/1234ABC')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual([
      { orbis_key: '0-1:1.8.0', orbis_value: 100 },
      { orbis_key: '0-2:1.8.0', orbis_value: 200 },
    ])
  })

  it('skips the push (no fetch) when the root path is missing', async () => {
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, statusText: 'OK' }) as any)
    globalThis.fetch = fetchMock as any
    const mk = (id: number, mqttname: string, v: unknown): ImodbusEntity =>
      ({ id, mqttname, converter: 'number', readonly: true, mqttValue: v }) as unknown as ImodbusEntity
    const spec = { entities: [mk(1, 'orbis[0].orbis_value', 100)] } as unknown as ImodbusSpecification
    const slave = new Slave(0, { slaveid: 1, httpPush: { url: 'https://api/x', root: 'missing', pushEntities: [1] } }, 'm2m')
    await HttpPush.pushState(slave, spec)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('secret encryption', () => {
  let tmp: string
  let originalSslDir: string
  beforeAll(() => {
    originalSslDir = ConfigPersistence.sslDir
    tmp = fs.mkdtempSync(join(tmpdir(), 'm2m-secret-'))
    ConfigPersistence.sslDir = tmp
  })
  afterAll(() => {
    ConfigPersistence.sslDir = originalSslDir
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('encrypt/decrypt roundtrip', () => {
    const plain = 'ghp_secretPersonalAccessToken123'
    const enc = encryptSecret(plain)
    expect(enc).not.toContain(plain)
    expect(decryptSecret(enc)).toBe(plain)
  })

  it('different plaintexts produce different ciphertexts', () => {
    const a = encryptSecret('tokenA')
    const b = encryptSecret('tokenB')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('tokenA')
    expect(decryptSecret(b)).toBe('tokenB')
  })
})
