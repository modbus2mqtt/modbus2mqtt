import { Icondition, ModbusRegisterType } from '../shared/specification/index.js'
import { ImodbusValues } from './modbusValues.js'

/**
 * Condition evaluation shared by the read path and the spec-to-values population.
 *
 * An entity is active when ALL of its conditions match (AND). A legacy single
 * `condition` is treated as a one-element list. Entities without conditions are
 * always active.
 */
export function entityConditions(entity: { condition?: Icondition | undefined; conditions?: Icondition[] | undefined }): Icondition[] {
  if (entity.conditions && entity.conditions.length > 0) return entity.conditions
  if (entity.condition) return [entity.condition]
  return []
}

/** Evaluate a single condition against one register value (or resolved bit). */
export function conditionMatches(c: Icondition, value: number | undefined): boolean {
  if (value === undefined || value === null) return false
  let actual = value
  if (c.mask !== undefined && c.mask !== null) actual = value & c.mask
  if (c.bit !== undefined && c.bit !== null) actual = (value >> c.bit) & 1
  const expected = c.value ?? 0
  const cmp = c.comparator || 'eq'
  // OR-set: matches if the (possibly bit-resolved) value is any of `values`.
  if (c.values !== undefined && c.values !== null) {
    return c.values.includes(actual)
  }
  switch (cmp) {
    case 'eq': return actual === expected
    case 'ne': return actual !== expected
    case 'lt': return actual < expected
    case 'le': return actual <= expected
    case 'gt': return actual > expected
    case 'ge': return actual >= expected
    case 'contains': return expected !== undefined && ((actual >> Math.trunc(expected)) & 1) === 1
    case 'hasbit': return expected !== undefined && ((actual >> Math.trunc(expected)) & 1) === 1
    default: return actual === expected
  }
}

/** Read a register value from the values map. */
export function readConditionValue(values: ImodbusValues, c: Icondition): number | undefined {
  const t = c.registerType ?? ModbusRegisterType.HoldingRegister
  switch (t) {
    case ModbusRegisterType.AnalogInputs: return values.analogInputs.get(c.register)?.data?.[0]
    case ModbusRegisterType.HoldingRegister: return values.holdingRegisters.get(c.register)?.data?.[0]
    case ModbusRegisterType.Coils: return values.coils.get(c.register)?.data?.[0]
    default: return values.discreteInputs.get(c.register)?.data?.[0]
  }
}

/**
 * Whether the entity is active given the full values map (which must include
 * every condition register). Missing condition registers make the entity
 * inactive (an unknown condition should not show a possibly-present sensor).
 */
export function isEntityActiveByValues(
  entity: { condition?: Icondition | undefined; conditions?: Icondition[] | undefined },
  values: ImodbusValues
): boolean {
  const conds = entityConditions(entity)
  if (conds.length === 0) return true
  for (const c of conds) {
    const v = readConditionValue(values, c)
    if (!conditionMatches(c, v)) return false
  }
  return true
}