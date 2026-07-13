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
    const response = await ts
      .request()
      .get(apiUri.bus + '?busid=0')
      .expect(200)
    const bus: IBus = response.body
    expect(bus.busId).toBe(0)
    expect(bus.connectionData).toBeDefined()
  })
  it('returns bus slaves without embedded specification, leaving the in-memory slaves intact', async () => {
    const response = await ts
      .request()
      .get(apiUri.bus + '?busid=0')
      .expect(200)
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
    await ts
      .request()
      .post(apiUri.bus + '?busid=0')
      .send(conn)
      .expect(HttpErrorsEnum.OkCreated)
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
    const response = await ts
      .request()
      .get(apiUri.slaves + '?busid=0')
      .expect(200)
    expect(response.body.length).toBeGreaterThan(0)
    expect(response.body[0]).toHaveProperty('slaveid')
  })
  it('decouples slaves from specifications: no embedded specification in the payload', async () => {
    const response = await ts
      .request()
      .get(apiUri.slaves + '?busid=0')
      .expect(200)
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
    const response = await ts
      .request()
      .get(apiUri.slave + '?busid=0&slaveid=1')
      .expect(200)
    const slave: Islave = response.body
    expect(slave.slaveid).toBe(1)
  })
  it('returns the slave without embedded specification, leaving the in-memory slave intact', async () => {
    const response = await ts
      .request()
      .get(apiUri.slave + '?busid=0&slaveid=1')
      .expect(200)
    expect(response.body.specificationid).toBeDefined()
    expect(response.body).not.toHaveProperty('specification')
    expect(Bus.getBus(0)!.getSlaveBySlaveId(1)!.specification).toBeDefined()
  })
  it('fails without slaveid', async () => {
    await ts
      .request()
      .get(apiUri.slave + '?busid=0')
      .parse(rawText)
      .expect(HttpErrorsEnum.ErrInvalidParameter)
  })
})

describe('POST/DELETE ' + apiUri.slave, () => {
  it('creates and deletes a slave', async () => {
    const newSlave: Islave = { slaveid: 21, name: 'http-test-slave', specificationid: 'waterleveltransmitter' } as Islave
    const postResponse = await ts
      .request()
      .post(apiUri.slave + '?busid=0')
      .send(newSlave)
      .expect(HttpErrorsEnum.OkCreated)
    expect(postResponse.body.slaveid).toBe(21)
    // response is decoupled from the specification, the in-memory slave is not
    expect(postResponse.body).not.toHaveProperty('specification')
    expect(Bus.getBus(0)!.getSlaveBySlaveId(21)).toBeDefined()
    expect(Bus.getBus(0)!.getSlaveBySlaveId(21)!.specification).toBeDefined()

    await ts
      .request()
      .delete(apiUri.slave + '?busid=0&slaveid=21')
      .expect(200)
    expect(Bus.getBus(0)!.getSlaveBySlaveId(21)).toBeUndefined()
  })
  it('POST fails without busid', async () => {
    await ts.request().post(apiUri.slave).send({ slaveid: 21 }).parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
  it('POST fails without slaveid in body', async () => {
    await ts
      .request()
      .post(apiUri.slave + '?busid=0')
      .send({ name: 'no-slaveid' })
      .parse(rawText)
      .expect(HttpErrorsEnum.ErrBadRequest)
  })
  it('DELETE fails without slaveid', async () => {
    await ts
      .request()
      .delete(apiUri.slave + '?busid=0')
      .parse(rawText)
      .expect(HttpErrorsEnum.ErrBadRequest)
  })
})

describe('referencing slaves via ' + apiUri.slave, () => {
  const ROOT_ID = 31
  const CHILD_ID = 32

  async function postRoot(): Promise<void> {
    const root: Islave = {
      slaveid: ROOT_ID,
      name: 'root meter',
      specificationid: 'waterleveltransmitter',
      httpPush: { url: 'https://heimvio.de/readings/{{ slaveName }}' },
    } as Islave
    await ts
      .request()
      .post(apiUri.slave + '?busid=0')
      .send(root)
      .expect(HttpErrorsEnum.OkCreated)
  }
  async function postChild(): Promise<void> {
    const child: Islave = { slaveid: CHILD_ID, referenceSlaveId: ROOT_ID, name: 'child meter' } as Islave
    await ts
      .request()
      .post(apiUri.slave + '?busid=0')
      .send(child)
      .expect(HttpErrorsEnum.OkCreated)
  }
  async function cleanup(): Promise<void> {
    for (const id of [CHILD_ID, ROOT_ID])
      if (Bus.getBus(0)!.getSlaveBySlaveId(id)) await ts.request().delete(apiUri.slave + '?busid=0&slaveid=' + id)
  }

  it('serves a referencing slave with the inherited fields materialized', async () => {
    await postRoot()
    await postChild()
    try {
      const response = await ts
        .request()
        .get(apiUri.slave + '?busid=0&slaveid=' + CHILD_ID)
        .expect(200)
      const child: Islave = response.body
      expect(child.referenceSlaveId).toBe(ROOT_ID)
      expect(child.specificationid).toBe('waterleveltransmitter')
      expect(child.httpPush!.url).toBe('https://heimvio.de/readings/{{ slaveName }}')
      expect(child.name).toBe('child meter')
    } finally {
      await cleanup()
    }
  })

  it('DELETE of a referenced slave conflicts and names the referencing slaves', async () => {
    await postRoot()
    await postChild()
    try {
      const response = await ts
        .request()
        .delete(apiUri.slave + '?busid=0&slaveid=' + ROOT_ID)
        .parse(rawText)
        .expect(HttpErrorsEnum.ErrConflict)
      expect(String(response.body)).toContain(String(CHILD_ID))
      expect(Bus.getBus(0)!.getSlaveBySlaveId(ROOT_ID)).toBeDefined()
    } finally {
      await cleanup()
    }
  })

  it('DELETE with detachReferences keeps the referencing slaves as standalone slaves', async () => {
    await postRoot()
    await postChild()
    try {
      await ts
        .request()
        .delete(apiUri.slave + '?busid=0&slaveid=' + ROOT_ID + '&detachReferences=true')
        .expect(200)
      expect(Bus.getBus(0)!.getSlaveBySlaveId(ROOT_ID)).toBeUndefined()
      const detached = Bus.getBus(0)!.getSlaveBySlaveId(CHILD_ID)!
      expect(detached.referenceSlaveId).toBeUndefined()
      expect(detached.specificationid).toBe('waterleveltransmitter')
      expect(detached.httpPush!.url).toBe('https://heimvio.de/readings/{{ slaveName }}')
    } finally {
      await cleanup()
    }
  })

  it('POST rejects a reference to an unknown slave', async () => {
    await ts
      .request()
      .post(apiUri.slave + '?busid=0')
      .send({ slaveid: CHILD_ID, referenceSlaveId: 987 })
      .parse(rawText)
      .expect(HttpErrorsEnum.ErrInvalidParameter)
  })

  it('POST rejects a self reference', async () => {
    await ts
      .request()
      .post(apiUri.slave + '?busid=0')
      .send({ slaveid: CHILD_ID, referenceSlaveId: CHILD_ID })
      .parse(rawText)
      .expect(HttpErrorsEnum.ErrInvalidParameter)
  })

  it('POST rejects a chain: the referenced slave must not be a reference itself', async () => {
    await postRoot()
    await postChild()
    try {
      await ts
        .request()
        .post(apiUri.slave + '?busid=0')
        .send({ slaveid: 33, referenceSlaveId: CHILD_ID })
        .parse(rawText)
        .expect(HttpErrorsEnum.ErrInvalidParameter)
      expect(Bus.getBus(0)!.getSlaveBySlaveId(33)).toBeUndefined()
    } finally {
      await cleanup()
    }
  })
})
