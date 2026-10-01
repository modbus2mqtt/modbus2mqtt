import { ImodbusValues } from '../../../specification/index.js'

/**
 * Decide whether a scan probe for a slave id actually got a response.
 *
 * `ModbusAPI.readModbusRegister()` resolves with per-address results instead of
 * throwing on a failed read: a timeout / exception for the probed address is
 * recorded in the result map as `{ error }` (see ModbusRTUProcessor). A probe
 * that only checks "did the promise resolve" therefore reports every id in the
 * scan range as present - the exact bug this fixes. Only a result that carries
 * data for the probed address (holding register 0) means the slave answered.
 */
export function scanProbeOk(values: ImodbusValues | undefined | null): boolean {
  if (!values) return false
  const r = values.holdingRegisters.get(0)
  return !!r && !!r.data && r.data.length > 0
}
