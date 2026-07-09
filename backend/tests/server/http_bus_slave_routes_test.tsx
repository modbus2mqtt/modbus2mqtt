import { describe, it, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { apiUri, IBus, IModbusConnection, IRTUConnection, Islave } from '../../src/shared/server/index.js'
import { HttpErrorsEnum } from '../../src/shared/specification/index.js'
import { Bus } from '../../src/server/bus.js'
import { ConfigBus } from '../../src/server/configbus.js'
import { initBussesForTest } from './configsbase.js'
import { createTestServer, rawText, TestServer } from './httpTestHelper.js'

let ts: TestServer
beforeAll(async () => {
  ts = await createTestServer({ name: 'http-bus-slave-routes' })
})
afterAll(() => ts.cleanup())

describe('GET ' + apiUri.busses, () => {
  it('lists all busses', async () => {
    const response = await ts.request().get(apiUri.busses).expect(200)
    const busses: IBus[] = response.body
    expect(busses.length).toBeGreaterThan(0)
    expect((busses[0].connectionData as IRTUConnection).serialport.length).toBeGreaterThan(0)
  })
})

describe('GET ' + apiUri.bus, () => {
  it('returns a single bus', async () => {
    const response = await ts.request().get(apiUri.bus + '?busid=0').expect(200)
    const bus: IBus = response.body
    expect(bus.busId).toBe(0)
    expect(bus.connectionData).toBeDefined()
  })
  it('returns bus slaves without embedded specification, leaving the in-memory slaves intact', async () => {
    const response = await ts.request().get(apiUri.bus + '?busid=0').expect(200)
    const bus: IBus = response.body
    const withSpecId = bus.slaves.find((s) => s.specificationid != undefined)
    expect(withSpecId).toBeDefined()
    bus.slaves.forEach((s) => expect(s).not.toHaveProperty('specification'))
    // in-memory slaves keep the specification (poller/discovery depend on it)
    expect(Bus.getBus(0)!.getSlaveBySlaveId(withSpecId!.slaveid)!.specification).toBeDefined()
  })
  it('fails without busid', async () => {
    await ts.request().get(apiUri.bus).parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
})

describe('POST/DELETE ' + apiUri.bus, () => {
  test('ADD/DELETE bus', async () => {
    const newConn: IModbusConnection = {
      baudrate: 9600,
      serialport: '/dev/ttyACM1',
      timeout: 200,
    }
    initBussesForTest()

    const oldLength = Bus.getBusses().length
    const mockStaticF = vi.fn(() => Promise.resolve(new Bus({ busId: 7, slaves: [], connectionData: {} as never })))
    const orig = Bus.addBus
    Bus.addBus = mockStaticF as never
    try {
      const postResponse = await ts
        .request()
        .post(apiUri.bus)
        .accept('application/json')
        .send(newConn)
        .set('Content-Type', 'application/json')
        .expect(HttpErrorsEnum.OkCreated)
      const newNumber = postResponse.body
      await ts
        .request()
        .delete(apiUri.bus + '?busid=' + newNumber.busid)
        .expect(200)
      expect(Bus.getBusses().length).toBe(oldLength)
    } finally {
      Bus.addBus = orig
    }
  })

  test('update bus', async () => {
    const conn = structuredClone(Bus.getBus(0)!.properties.connectionData)
    conn.timeout = 500
    initBussesForTest()
    ConfigBus.updateBusProperties(Bus.getBus(0)!.properties, conn)
    await ts.request().post(apiUri.bus + '?busid=0').send(conn).expect(HttpErrorsEnum.OkCreated)
    expect(Bus.getBus(0)!.properties.connectionData.timeout).toBe(500)
    conn.timeout = 100
    ConfigBus.updateBusProperties(Bus.getBus(0)!.properties, conn)
    expect(Bus.getBus(0)!.properties.connectionData.timeout).toBe(100)
  })

  test('DELETE bus fails without busid', async () => {
    await ts.request().delete(apiUri.bus).parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
})

describe('GET ' + apiUri.slaves, () => {
  it('lists slaves of a bus', async () => {
    const response = await ts.request().get(apiUri.slaves + '?busid=0').expect(200)
    expect(response.body.length).toBeGreaterThan(0)
    expect(response.body[0]).toHaveProperty('slaveid')
  })
  it('decouples slaves from specifications: no embedded specification in the payload', async () => {
    const response = await ts.request().get(apiUri.slaves + '?busid=0').expect(200)
    const withSpecId = response.body.find((s: Islave) => s.specificationid != undefined)
    expect(withSpecId).toBeDefined()
    response.body.forEach((s: Islave) => expect(s).not.toHaveProperty('specification'))
    // the in-memory slave keeps its specification — poller and discovery depend on it
    const inMemory = Bus.getBus(0)!
      .getSlaves()
      .find((s) => s.slaveid == withSpecId.slaveid)
    expect(inMemory?.specification).toBeDefined()
  })
  it('fails without busid', async () => {
    await ts.request().get(apiUri.slaves).parse(rawText).expect(HttpErrorsEnum.ErrInvalidParameter)
  })
})

describe('GET ' + apiUri.slave, () => {
  it('returns a single slave', async () => {
    const response = await ts.request().get(apiUri.slave + '?busid=0&slaveid=1').expect(200)
    const slave: Islave = response.body
    expect(slave.slaveid).toBe(1)
  })
  it('returns the slave without embedded specification, leaving the in-memory slave intact', async () => {
    const response = await ts.request().get(apiUri.slave + '?busid=0&slaveid=1').expect(200)
    expect(response.body.specificationid).toBeDefined()
    expect(response.body).not.toHaveProperty('specification')
    expect(Bus.getBus(0)!.getSlaveBySlaveId(1)!.specification).toBeDefined()
  })
  it('fails without slaveid', async () => {
    await ts.request().get(apiUri.slave + '?busid=0').parse(rawText).expect(HttpErrorsEnum.ErrInvalidParameter)
  })
})

describe('POST/DELETE ' + apiUri.slave, () => {
  it('creates and deletes a slave', async () => {
    const newSlave: Islave = { slaveid: 21, name: 'http-test-slave', specificationid: 'waterleveltransmitter' } as Islave
    const postResponse = await ts.request().post(apiUri.slave + '?busid=0').send(newSlave).expect(HttpErrorsEnum.OkCreated)
    expect(postResponse.body.slaveid).toBe(21)
    // response is decoupled from the specification, the in-memory slave is not
    expect(postResponse.body).not.toHaveProperty('specification')
    expect(Bus.getBus(0)!.getSlaveBySlaveId(21)).toBeDefined()
    expect(Bus.getBus(0)!.getSlaveBySlaveId(21)!.specification).toBeDefined()

    await ts.request().delete(apiUri.slave + '?busid=0&slaveid=21').expect(200)
    expect(Bus.getBus(0)!.getSlaveBySlaveId(21)).toBeUndefined()
  })
  it('POST fails without busid', async () => {
    await ts.request().post(apiUri.slave).send({ slaveid: 21 }).parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
  it('POST fails without slaveid in body', async () => {
    await ts.request().post(apiUri.slave + '?busid=0').send({ name: 'no-slaveid' }).parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
  it('DELETE fails without slaveid', async () => {
    await ts.request().delete(apiUri.slave + '?busid=0').parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
})
