import { Ientity, ImodbusEntity, Inumber, VariableTargetParameters } from '../shared/specification/index.js'

/** value of another entity that is configured as variable for the given target parameter */
export function getPropertyFromVariable(
  entities: Ientity[],
  entityId: number,
  targetParameter: VariableTargetParameters
): string | number | undefined {
  const ent = entities.find(
    (e) =>
      e.variableConfiguration &&
      e.variableConfiguration.targetParameter == targetParameter &&
      e.variableConfiguration.entityId &&
      e.variableConfiguration.entityId == entityId
  )
  if (ent) return (ent as ImodbusEntity).mqttValue
  return undefined
}

export function getEntityFromId(entities: Ientity[], entityId: number): Ientity | undefined {
  return entities.find((e) => e.id == entityId)
}

export function getMultiplier(entities: Ientity[], entityId: number): number | undefined {
  const rc = getPropertyFromVariable(entities, entityId, VariableTargetParameters.entityMultiplier)
  if (rc) return rc as number | undefined
  const ent = getEntityFromId(entities, entityId)
  if (!ent || !ent.converterParameters || undefined == (ent.converterParameters as Inumber).multiplier) return undefined

  return (ent.converterParameters as Inumber).multiplier
}

export function getOffset(entities: Ientity[], entityId: number): number | undefined {
  const rc = getPropertyFromVariable(entities, entityId, VariableTargetParameters.entityOffset)
  if (rc) return rc as number | undefined
  const ent = getEntityFromId(entities, entityId)
  if (!ent || !ent.converterParameters || (ent.converterParameters as Inumber).offset == undefined) return undefined
  return (ent.converterParameters as Inumber).offset
}
