import {
  IbaseSpecification,
  IdentifiedStates,
  Imessage,
  ImodbusSpecification,
  ISpecificationText,
  Ispecification,
  MessageCategories,
  MessageTypes,
  SpecificationFileUsage,
  getSpecificationI18nName,
  validateTranslation,
} from '../shared/specification/index.js'
import { IfileSpecification } from './ifilespecification.js'
import { ConfigSpecification } from './configspec.js'
import { fileToModbusSpecification, setIdentifiedByEntities } from './modbusValues.js'

export function validateFiles(spec: IbaseSpecification, msgs: Imessage[]): void {
  const category = MessageCategories.validateFiles
  let hasDocumentation = false
  let hasImage = false
  spec.files.forEach((f) => {
    if (f.usage == SpecificationFileUsage.documentation) hasDocumentation = true
    if (f.usage == SpecificationFileUsage.img) hasImage = true
  })
  if (!hasDocumentation) msgs.push({ type: MessageTypes.noDocumentation, category: category })
  if (!hasImage) msgs.push({ type: MessageTypes.noImage, category: category })
}

/** structural checks: files, entities, translations (english is mandatory for contributions) */
export function validateBaseSpecification(spec: ImodbusSpecification, language: string, forContribution: boolean = false): Imessage[] {
  const msgs: Imessage[] = []
  validateFiles(spec, msgs)
  if (spec.entities.length == 0) msgs.push({ type: MessageTypes.noEntity, category: MessageCategories.validateEntity })
  validateTranslation(spec, language, msgs)
  if (forContribution) validateTranslation(spec, 'en', msgs)
  return msgs
}

export function validateUniqueName(spec: IbaseSpecification, language: string): boolean {
  const name = getSpecificationI18nName(spec, language)
  let rc = true
  new ConfigSpecification().filterAllSpecifications((other) => {
    if (rc && spec.filename != other.filename) {
      const texts = other.i18n.find((lang) => lang.lang == language)
      if (texts && texts.texts)
        if ((texts.texts as ISpecificationText[]).find((text) => text.textId == 'name' && text.text == name)) rc = false
    }
  })
  return rc
}

/** full validation: structure, testdata identification and name uniqueness */
export function validateSpecification(spec: Ispecification, language: string): Imessage[] {
  const rc = validateBaseSpecification(spec as ImodbusSpecification, language, true)
  if (spec.entities.length > 0) {
    let mSpec = spec as ImodbusSpecification
    if (mSpec.identified == undefined) mSpec = fileToModbusSpecification(spec as IfileSpecification)
    else setIdentifiedByEntities(mSpec)

    if (mSpec.identified != IdentifiedStates.identified)
      rc.push({ type: MessageTypes.notIdentified, category: MessageCategories.validateSpecification })
  }

  if (!validateUniqueName(spec as IbaseSpecification, language))
    rc.push({ type: MessageTypes.nonUniqueName, category: MessageCategories.validateSpecification })
  return rc
}
