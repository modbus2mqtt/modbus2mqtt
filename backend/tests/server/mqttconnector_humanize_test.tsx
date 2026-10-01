import { expect, it, describe } from 'vitest'
import { MqttConnector } from '../../src/server/mqttconnector.js'

describe('MqttConnector.humanizeMqttError', () => {
  const c = new MqttConnector()

  it('maps bad username/password CONNACK to an authentication hint', () => {
    const e = new Error('Connection refused: Bad username or password')
    const msg = c.humanizeMqttError(e, 'mqtt://localhost:1883')
    expect(msg).toMatch(/Authentication failed/i)
    expect(msg).toMatch(/username and password/i)
  })

  it('maps not authorized CONNACK to an authentication hint', () => {
    const e = new Error('Connection refused: Not authorized')
    expect(c.humanizeMqttError(e, 'mqtt://x')).toMatch(/Authentication failed/i)
  })

  it('maps server unavailable CONNACK to a temporary-unavailable message', () => {
    const e = new Error('Connection refused: Server unavailable')
    expect(c.humanizeMqttError(e, 'mqtt://x')).toMatch(/temporarily unavailable/i)
  })

  it('maps ECONNREFUSED to a broker-not-reachable message', () => {
    const e = new Error('connect ECONNREFUSED 127.0.0.1:1883') as NodeJS.ErrnoException
    e.code = 'ECONNREFUSED'
    const msg = c.humanizeMqttError(e, 'mqtt://127.0.0.1:1883')
    expect(msg).toMatch(/Connection refused/)
    expect(msg).toMatch(/not reachable/i)
  })

  it('maps ENOTFOUND to a host-not-found message', () => {
    const e = new Error('getaddrinfo ENOTFOUND nonexistent.local') as NodeJS.ErrnoException
    e.code = 'ENOTFOUND'
    const msg = c.humanizeMqttError(e, 'mqtt://nonexistent.local')
    expect(msg).toMatch(/Host not found/i)
  })

  it('maps ETIMEDOUT to a timeout message', () => {
    const e = new Error('connect ETIMEDOUT 10.0.0.1:1883') as NodeJS.ErrnoException
    e.code = 'ETIMEDOUT'
    expect(c.humanizeMqttError(e, 'mqtt://10.0.0.1')).toMatch(/timed out/i)
  })

  it('falls back to a generic message with the original error text', () => {
    const e = new Error('Something exotic broke')
    const msg = c.humanizeMqttError(e, 'mqtt://x')
    expect(msg).toMatch(/Something exotic broke/)
  })
})
