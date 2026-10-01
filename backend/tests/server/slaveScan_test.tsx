import { describe, expect, it } from 'vitest'
import { emptyModbusValues, ImodbusValues } from '../../src/specification/index.js'
import { scanProbeOk } from '../../src/server/http/routes/slaveScan.js'

function valuesWithHolding0(data?: number[], error?: Error): ImodbusValues {
  const v = emptyModbusValues()
  if (data) v.holdingRegisters.set(0, { data })
  if (error) v.holdingRegisters.set(0, { error })
  return v
}

describe('scanProbeOk (slave-id scan probe)', () => {
  it('returns true when the probed holding register has data', () => {
    expect(scanProbeOk(valuesWithHolding0([42]))).toBe(true)
  })
  it('returns false when the probed register carries an error', () => {
    // This is what a real timeout / modbus exception resolves to: the read
    // promise resolves, but the value map contains {error} - the pre-fix
    // probe incorrectly returned true here.
    expect(scanProbeOk(valuesWithHolding0(undefined, new Error('timeout')))).toBe(false)
  })
  it('returns false for an empty result map', () => {
    expect(scanProbeOk(emptyModbusValues())).toBe(false)
  })
  it('returns false for null/undefined', () => {
    expect(scanProbeOk(null)).toBe(false)
    expect(scanProbeOk(undefined)).toBe(false)
  })
  it('returns false when data is present but empty', () => {
    expect(scanProbeOk(valuesWithHolding0([]))).toBe(false)
  })
  it('ignores data on other register types (holding 0 is the probe address)', () => {
    const v = emptyModbusValues()
    v.coils.set(0, { data: [1] })
    expect(scanProbeOk(v)).toBe(false)
  })
})
