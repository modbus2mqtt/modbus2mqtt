import { describe, it, expect } from 'vitest'
import { normalizeModbusTimeout } from '../../src/server/bus.js'
import { BUS_TIMEOUT_DEFAULT } from '../../src/shared/specification/index.js'

describe('normalizeModbusTimeout', () => {
  it("returns the configured timeout when it is a positive number", () => {
    expect(normalizeModbusTimeout(500)).toBe(500)
    expect(normalizeModbusTimeout(1000)).toBe(1000)
    expect(normalizeModbusTimeout(30000)).toBe(30000)
  })

  it('falls back to BUS_TIMEOUT_DEFAULT when the timeout is missing', () => {
    expect(normalizeModbusTimeout(undefined)).toBe(BUS_TIMEOUT_DEFAULT)
  })

  it('falls back to BUS_TIMEOUT_DEFAULT when the timeout is zero or negative', () => {
    // 0/negative would disable modbus-serial's request timeout entirely and hang the worker.
    expect(normalizeModbusTimeout(0)).toBe(BUS_TIMEOUT_DEFAULT)
    expect(normalizeModbusTimeout(-1)).toBe(BUS_TIMEOUT_DEFAULT)
    expect(normalizeModbusTimeout(NaN)).toBe(BUS_TIMEOUT_DEFAULT)
  })
})