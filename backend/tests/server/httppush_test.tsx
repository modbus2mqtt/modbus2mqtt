import { it, expect, describe, beforeAll, afterAll } from '@jest/globals'
import * as fs from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Converters, IfileSpecification, ModbusRegisterType } from '../../src/shared/specification/index.js'
import { M2mSpecification } from '../../src/specification/index.js'
import { Islave, PollModes, Slave } from '../../src/shared/server/index.js'
import { ImodbusEntity } from '../../src/shared/specification/index.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { encryptSecret, decryptSecret } from '../../src/server/secureSecret.js'

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
    const payload = JSON.parse(slave.getHttpPushPayload(entities))
    expect(payload).toEqual({ obis: '1-0:1.0.8', obis_value: 234 })
  })

  it('shouldPublishMqtt is true for normal interval mode', () => {
    const slave = new Slave(0, { slaveid: 1, pollMode: PollModes.intervall }, 'm2m')
    expect(slave.shouldPublishMqtt()).toBe(true)
    expect(slave.hasHttpPush()).toBe(false)
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
