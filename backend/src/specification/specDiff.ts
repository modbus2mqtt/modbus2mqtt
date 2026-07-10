import {
  Imessage,
  Inumber,
  Iselect,
  Ispecification,
  Itext,
  MessageCategories,
  MessageTypes,
  getParameterType,
  getSpecificationI18nEntityName,
} from '../shared/specification/index.js'

/** loose equality used by the spec comparison: null==undefined, type-coercing == */
export function isEqualValue(v1: unknown, v2: unknown): boolean {
    if (v1 == null && v2 == null) return true
    if (v1 != null && v2 != null && (v1 as unknown) == (v2 as unknown)) return true
    return false
  }
/** compares a specification against another (usually the public) one and lists the differences */
export function compareSpecifications(spec: Ispecification, other: Ispecification): Imessage[] {
    const rc: Imessage[] = []
    if (spec.filename != other.filename) rc.push({ type: MessageTypes.differentFilename, category: MessageCategories.compare })
    spec.entities.forEach((ent) => {
      if (!other.entities.find((oent) => oent.id == ent.id))
        rc.push({ type: MessageTypes.addedEntity, category: MessageCategories.compareEntity, referencedEntity: ent.id })
    })
    other.entities.forEach((oent) => {
      const ent = spec.entities.find((ent) => oent.id == ent.id)
      if (!ent)
        rc.push({
          type: MessageTypes.missingEntity,
          category: MessageCategories.compare,
          additionalInformation: getSpecificationI18nEntityName(other, 'en', oent.id) ?? undefined,
        })
      else {
        if (!isEqualValue(oent.converter, ent.converter))
          rc.push({ type: MessageTypes.differentConverter, category: MessageCategories.compareEntity, referencedEntity: ent.id })
        if (!isEqualValue(oent.modbusAddress, ent.modbusAddress))
          rc.push({
            type: MessageTypes.differentModbusAddress,
            category: MessageCategories.compareEntity,
            referencedEntity: ent.id,
          })
        if (!isEqualValue(oent.registerType, ent.registerType))
          rc.push({ type: MessageTypes.differentFunctionCode, category: MessageCategories.compareEntity, referencedEntity: ent.id })
        if (!isEqualValue(oent.icon, ent.icon))
          rc.push({ type: MessageTypes.differentIcon, category: MessageCategories.compareEntity, referencedEntity: ent.id })
        if (oent.variableConfiguration && ent.variableConfiguration) {
          if (!isEqualValue(oent.variableConfiguration.targetParameter, ent.variableConfiguration.targetParameter))
            rc.push({
              type: MessageTypes.differentTargetParameter,
              category: MessageCategories.compareEntity,
              referencedEntity: ent.id,
            })
          else if (!isEqualValue(oent.variableConfiguration.entityId, ent.variableConfiguration.entityId))
            rc.push({
              type: MessageTypes.differentVariableEntityId,
              category: MessageCategories.compareEntity,
              referencedEntity: ent.id,
            })
        } else if (oent.variableConfiguration || ent.variableConfiguration)
          rc.push({
            type: MessageTypes.differentVariableConfiguration,
            category: MessageCategories.compareEntity,
            referencedEntity: ent.id,
          })
        if (ent.converterParameters && oent.converterParameters)
          switch (getParameterType(oent.converter)) {
            case 'Inumber':
              if (
                !isEqualValue(
                  (oent.converterParameters as Inumber).device_class,
                  (ent.converterParameters as Inumber).device_class
                )
              )
                rc.push({
                  type: MessageTypes.differentDeviceClass,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              if ((oent.converterParameters as Inumber).identification && (ent.converterParameters as Inumber).identification) {
                if (
                  !isEqualValue(
                    (oent.converterParameters as Inumber).identification!.max,
                    (ent.converterParameters as Inumber).identification!.max
                  )
                )
                  rc.push({
                    type: MessageTypes.differentIdentificationMax,
                    category: MessageCategories.compareEntity,
                    referencedEntity: ent.id,
                  })
                else if (
                  !isEqualValue(
                    (oent.converterParameters as Inumber).identification!.min,
                    (ent.converterParameters as Inumber).identification!.min
                  )
                )
                  rc.push({
                    type: MessageTypes.differentIdentificationMin,
                    category: MessageCategories.compareEntity,
                    referencedEntity: ent.id,
                  })
              } else if (
                (oent.converterParameters as Inumber).identification ||
                (ent.converterParameters as Inumber).identification
              )
                rc.push({
                  type: MessageTypes.differentIdentification,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              if (
                !isEqualValue(
                  (oent.converterParameters as Inumber).multiplier,
                  (ent.converterParameters as Inumber).multiplier
                )
              )
                rc.push({
                  type: MessageTypes.differentMultiplier,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              if (!isEqualValue((oent.converterParameters as Inumber).offset, (ent.converterParameters as Inumber).offset))
                rc.push({ type: MessageTypes.differentOffset, category: MessageCategories.compareEntity, referencedEntity: ent.id })
              break
            case 'Iselect':
              if (
                JSON.stringify((oent.converterParameters as Iselect).optionModbusValues) !=
                JSON.stringify((ent.converterParameters as Iselect).optionModbusValues)
              )
                rc.push({
                  type: MessageTypes.differentOptionTable,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              break
            case 'Itext':
              if (
                !isEqualValue(
                  (oent.converterParameters as Itext).stringlength,
                  (ent.converterParameters as Itext).stringlength
                )
              )
                rc.push({
                  type: MessageTypes.differentStringlength,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              if (
                !isEqualValue(
                  (oent.converterParameters as Itext).identification,
                  (ent.converterParameters as Itext).identification
                )
              )
                rc.push({
                  type: MessageTypes.differentIdentification,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              break
          }
      }
    })

    if (JSON.stringify(spec.i18n) != JSON.stringify(other.i18n))
      rc.push({ type: MessageTypes.differentTranslation, category: MessageCategories.compare })
    if (!isEqualValue(spec.manufacturer, other.manufacturer))
      rc.push({ type: MessageTypes.differentManufacturer, category: MessageCategories.compare })
    if (!isEqualValue(spec.model, other.model))
      rc.push({ type: MessageTypes.differentModel, category: MessageCategories.compare })
    if (!isEqualValue(spec.identification, other.identification))
      rc.push({ type: MessageTypes.differentIdentification, category: MessageCategories.compare })
    return rc
  }

