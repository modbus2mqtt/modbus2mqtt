import { ImodbusSpecification, Ispecification, VariableTargetParameters } from './types.js'
export enum MessageTypes {
  nameTextMissing = 0,
  entityTextMissing = 1,
  translationMissing = 2,
  noEntity = 3,
  noDocumentation = 4,
  noImage = 5,
  identifiedByOthers = 27,
  nonUniqueName = 28,
  notIdentified = 29,
  warningWithNoNote = 30,
  //compare
  differentFilename = 6,
  missingEntity = 7,
  differentConverter = 8,
  addedEntity = 9,
  differentModbusAddress = 10,
  differentFunctionCode = 11,
  differentIcon = 12,
  differentTargetParameter = 13,
  differentVariableEntityId = 14,
  differentVariableConfiguration = 15,
  differentDeviceClass = 16,
  differentIdentificationMax = 17,
  differentIdentificationMin = 18,
  differentIdentification = 19,
  differentMultiplier = 20,
  differentOffset = 21,
  differentOptionTable = 22,
  differentStringlength = 23,
  differentManufacturer = 24,
  differentModel = 25,
  differentTranslation = 26,
  noMqttDiscoveryLanguage = 31,
}

export enum MessageCategories {
  validateFilename = 0,
  validateEntity = 1,
  validateTranslation = 2,
  validateFiles = 3,
  compare = 4,
  compareEntity = 5,
  validateOtherIdentification = 6,
  validateSpecification = 7,
  configuration = 8,
}
export interface Imessage {
  type: MessageTypes
  category: MessageCategories
  referencedEntity?: number
  additionalInformation?: string | string[]
}
export const editableConverters: string[] = ['binary_sensor', 'binary', 'switch', 'number', 'text', 'select', 'button']

export function validateTranslation(spec: Ispecification, language: string, msgs: Imessage[]) {
  const en = spec.i18n.find((l: { lang: string }) => l.lang === language)
  const category = MessageCategories.validateTranslation
  if (spec.entities.length > 0) {
    if (!en)
      msgs.push({
        type: MessageTypes.translationMissing,
        category: category,
        additionalInformation: language,
      })
    else {
      spec.entities.forEach((ent: { variableConfiguration?: unknown; id: number }) => {
        if (!ent.variableConfiguration) {
          const translation = en!.texts.find((tx: { textId: string }) => tx.textId == 'e' + ent.id)
          if (!translation)
            msgs.push({
              type: MessageTypes.entityTextMissing,
              category: category,
              referencedEntity: ent.id,
              additionalInformation: language,
            })
        }
      })
      const nameTranslation = en?.texts.find((tx: { textId: string }) => tx.textId == 'name')
      if (!nameTranslation) msgs.push({ type: MessageTypes.nameTextMissing, category: category })
    }
  }
}

export function getBaseFilename(filename: string): string {
  const idx = filename.lastIndexOf('/')
  if (idx >= 0) return filename.substring(idx + 1)
  return filename
}
export function getUom(spec: ImodbusSpecification, entityId: number): string {
  const entUom = spec.entities.find(
    (e) =>
      e.variableConfiguration &&
      e.variableConfiguration.targetParameter == VariableTargetParameters.entityUom &&
      e.variableConfiguration.entityId == entityId
  )
  return entUom && entUom.mqttValue ? (entUom.mqttValue as string) : ''
}
