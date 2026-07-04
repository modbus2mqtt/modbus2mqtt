import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { VERSION } from 'ts-node'
import { apiUri, IidentificationSpecification } from '../../src/shared/server/index.js'
import {
  HttpErrorsEnum,
  IdentifiedStates,
  ImodbusEntity,
  ImodbusSpecification,
  ModbusRegisterType,
} from '../../src/shared/specification/index.js'
import { IfileSpecification } from '../../src/specification/index.js'
import { Modbus } from '../../src/server/modbus.js'
import { createTestServer, rawText, TestServer } from './httpTestHelper.js'

const spec: ImodbusSpecification = {
  filename: 'waterleveltransmitter',
  status: 2,
  entities: [
    {
      id: 1,
      mqttname: 'waterleveltransmitter',
      converter: 'number',
      modbusAddress: 3,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      converterParameters: { multiplier: 0.01 },
      mqttValue: '',
      modbusValue: [],
      identified: IdentifiedStates.unknown,
    },
  ],
  i18n: [
    {
      lang: 'en',
      texts: [
        { textId: 'name', text: 'Water Level Transmitter' },
        { textId: 'e1', text: 'Water Level Transmitter' },
      ],
    },
  ],
  files: [],
  identified: IdentifiedStates.unknown,
}
const spec2: IfileSpecification = { ...spec, version: VERSION, testdata: {} }
spec2.entities = [
  ...spec.entities,
  {
    id: 2,
    mqttname: '',
    converter: 'number',
    modbusAddress: 4,
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    converterParameters: { multiplier: 0.01 },
    variableConfiguration: {
      targetParameter: 2,
      entityId: 1,
    },
  } as never,
]

let ts: TestServer
beforeAll(async () => {
  ts = await createTestServer({ name: 'http-modbus-routes' })
})
afterAll(() => ts.cleanup())

describe('GET ' + apiUri.modbusSpecification, () => {
  it('returns the specification with modbus data', async () => {
    const response = await ts
      .request()
      .get(apiUri.modbusSpecification + '?busid=0&slaveid=1&spec=waterleveltransmitter')
      .expect(HttpErrorsEnum.OK)
    const rspec: ImodbusSpecification = response.body
    expect(((rspec?.entities[0] as ImodbusEntity).mqttValue as number) - 21).toBeLessThan(0.001)
  })
  it('fails without busid', async () => {
    await ts.request().get(apiUri.modbusSpecification + '?slaveid=1').parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
  it('fails for unknown bus', async () => {
    await ts.request().get(apiUri.modbusSpecification + '?busid=99&slaveid=1').parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
})

describe('GET ' + apiUri.specsDetection, () => {
  it('lists matching specifications for a slave', async () => {
    const response = await ts
      .request()
      .get(apiUri.specsDetection + '?busid=0&slaveid=1&language=en')
      .expect(200)
    expect(response.body.length).toBeGreaterThan(0)
    const found = response.body.find((specs: IidentificationSpecification) => specs.filename == 'waterleveltransmitter')
    expect(found).not.toBeNull()
  })
  it('fails without slaveid', async () => {
    await ts.request().get(apiUri.specsDetection + '?busid=0&language=en').parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
  it('fails without language', async () => {
    await ts.request().get(apiUri.specsDetection + '?busid=0&slaveid=1').parse(rawText).expect(HttpErrorsEnum.ErrInvalidParameter)
  })
})

describe('POST ' + apiUri.modbusEntity, () => {
  it('updates ModbusCache data', async () => {
    const response = await ts
      .request()
      .post(apiUri.modbusEntity + '?busid=0&slaveid=1&entityid=1')
      .send(spec2)
      .accept('application/json')
      .expect(HttpErrorsEnum.OkCreated)
    const entityAndMessages = response.body as ImodbusEntity
    expect(entityAndMessages.modbusValue[0]).toBe(1)
    expect(parseFloat(entityAndMessages.mqttValue as string)).toBe(0.01)
  })
  it('fails without busid/slaveid', async () => {
    await ts.request().post(apiUri.modbusEntity).send(spec2).parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
})

describe('POST ' + apiUri.writeEntity, () => {
  it('writes an entity value via modbus', async () => {
    const spy = vi.spyOn(Modbus, 'writeEntityMqtt').mockResolvedValue(undefined as never)
    try {
      await ts
        .request()
        .post(apiUri.writeEntity + '?busid=0&slaveid=1&entityid=1&mqttValue=21')
        .send(spec)
        .expect(HttpErrorsEnum.OkCreated)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
  it('fails without entityid/mqttValue', async () => {
    await ts
      .request()
      .post(apiUri.writeEntity + '?busid=0&slaveid=1')
      .send(spec)
      .parse(rawText).expect(HttpErrorsEnum.SrvErrInternalServerError)
  })
  it('fails without busid', async () => {
    await ts.request().post(apiUri.writeEntity).send(spec).parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
})
