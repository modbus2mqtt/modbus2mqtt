import { it, test, expect, beforeAll, afterAll } from 'vitest'
import { Observable, Subject } from 'rxjs'
import { ImodbusSpecification } from '../../src/shared/specification/index.js'
import { Slave } from '../../src/shared/server/index.js'
import { Config } from '../../src/server/config.js'
import { Bus } from '../../src/server/bus.js'
import { ConfigBus } from '../../src/server/configbus.js'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions.js'
import { createTestServer, TestServer } from './httpTestHelper.js'

let ts: TestServer
beforeAll(async () => {
  ts = await createTestServer({ name: 'http-slave-topics' })
})
afterAll(() => ts.cleanup())

class MockMqttSubsctription {
  slave: Slave = new Slave(0, Bus.getBus(0)!.getSlaveBySlaveId(1)!, Config.getConfiguration().mqttbasetopic)
  getSlaveBaseTopics(): string[] {
    return [this.slave.getBaseTopic() ?? '']
  }
  getSlave(): Slave | undefined {
    return this.slave
  }
  readModbus(slave: Slave): Observable<ImodbusSpecification> | undefined {
    const bus = Bus.getBus(slave.getBusId())
    if (bus) {
      const sub = new Subject<ImodbusSpecification>()
      setTimeout(() => {
        sub.next(slave.getSpecification() as ImodbusSpecification)
      }, 20)
      return sub
    }
    return undefined
  }
  sendEntityCommandWithPublish(_slave: Slave, topic: string, payload: string): Promise<void> {
    expect(topic.startsWith('/')).toBeFalsy()
    expect(payload).toBe('20.2')
    return Promise.resolve()
  }
  sendCommand(_slave: Slave, payload: string): Promise<void> {
    expect(payload.indexOf('20.2')).not.toBe(-1)
    return Promise.resolve()
  }
}
function prepareMqttSubscriptions(): MockMqttSubsctription {
  const mock = new MockMqttSubsctription()
  MqttSubscriptions['instance'] = mock as unknown as MqttSubscriptions
  return mock
}

it('GET state topic', async () => {
  const mock = prepareMqttSubscriptions()
  const response = await ts
    .request()
    .get('/' + mock.slave.getStateTopic())
    .expect(200)
  expect(response.text.indexOf('waterleveltransmitter')).not.toBe(-1)
})

test('GET command Entity topic', async () => {
  const mock = prepareMqttSubscriptions()
  ConfigBus.addSpecification(mock.slave['slave'])
  const spec = mock.slave.getSpecification()
  let url = '/' + mock.slave.getEntityCommandTopic(spec!.entities[2] as never)!.commandTopic
  url = url + '20.2'
  await ts.request().get(url).expect(200)
})

test('POST command topic', async () => {
  const mock = prepareMqttSubscriptions()
  const url = '/' + mock.slave.getCommandTopic()
  await ts.request().post(url).send({ hotwatertargettemperature: 20.2 }).expect(200)
})

test('unknown topic falls through to the SPA', async () => {
  const mock = prepareMqttSubscriptions()
  // a GET that matches no slave topic pattern ends up at the catch-all (index.html)
  const response = await ts
    .request()
    .get('/' + mock.slave.getBaseTopic() + '/unknown/')
    .expect(200)
  expect(response.type).toBe('text/html')
})
