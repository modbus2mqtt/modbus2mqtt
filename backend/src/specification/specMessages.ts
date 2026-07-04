import { IbaseSpecification, Imessage, MessageTypes, getSpecificationI18nEntityName } from '../shared/specification/index.js'

/** Renders validation/compare messages as text; identifiedByOthers is informational and filtered out. */
export function messages2Text(spec: IbaseSpecification, msgs: Imessage[]): string {
  let errors: string = ''
  msgs.forEach((msg) => {
    if (msg.type != MessageTypes.identifiedByOthers) errors += getMessageString(spec, msg) + '\n'
  })
  return errors
}

export function getMessageString(spec: IbaseSpecification, message: Imessage): string {
  switch (message.type) {
    case MessageTypes.noDocumentation:
      return `No documenation file or URL`
    case MessageTypes.nameTextMissing:
      return `The specification has no Name`
    case MessageTypes.entityTextMissing:
      return `entity has no name`
    case MessageTypes.translationMissing: {
      const info = message.additionalInformation
      const text = Array.isArray(info) ? info.join(', ') : (info ?? '')
      return `A translation is missing: ` + text
    }
    case MessageTypes.noEntity:
      return `No entity defined for this specification`
    case MessageTypes.noImage:
      return `No image file or URL`
    case MessageTypes.nonUniqueName:
      return `Specification name is not unique`
    case MessageTypes.identifiedByOthers: {
      const info = message.additionalInformation
      const names = Array.isArray(info) ? info : []
      const specNames = names.join(' ')
      return `Test data of this specification matches to the following other public specifications ${specNames}`
    }
    case MessageTypes.notIdentified:
      return ` The specification can not be identified with it's test data`
    case MessageTypes.differentFilename:
      return getMessageLocal(spec, message, 'Filename has been changed. A new public specification will be created')
    case MessageTypes.missingEntity:
      return getMessageLocal(spec, message, 'Entity has been removed')
    case MessageTypes.differentConverter:
      return getMessageLocal(spec, message, 'Converter has been changed')
    case MessageTypes.addedEntity:
      return getMessageLocal(spec, message, 'Entity has been added')
    case MessageTypes.differentModbusAddress:
      return getMessageLocal(spec, message, 'Modbus address has been changed')
    case MessageTypes.differentFunctionCode:
      return getMessageLocal(spec, message, 'Function code has been changed')
    case MessageTypes.differentIcon:
      return getMessageLocal(spec, message, 'Icon has been changed')
    case MessageTypes.differentTargetParameter:
      return getMessageLocal(spec, message, 'Variable configuration: Target parameter has been changed')
    case MessageTypes.differentVariableEntityId:
      return getMessageLocal(spec, message, 'Variable configuration: Referenced entity has been changed')
    case MessageTypes.differentVariableConfiguration:
      return getMessageLocal(spec, message, 'Variable configuration has been changed')
    case MessageTypes.differentDeviceClass:
      return getMessageLocal(spec, message, 'Device class has been changed')
    case MessageTypes.differentIdentificationMax:
      return getMessageLocal(spec, message, 'Max value has been changed')
    case MessageTypes.differentIdentificationMin:
      return getMessageLocal(spec, message, 'Min value has been changed')
    case MessageTypes.differentIdentification:
      return getMessageLocal(spec, message, 'Identification has been changed')
    case MessageTypes.differentMultiplier:
      return getMessageLocal(spec, message, 'Multiplier has been changed')
    case MessageTypes.differentOffset:
      return getMessageLocal(spec, message, 'Offset has been changed')
    case MessageTypes.differentOptionTable:
      return getMessageLocal(spec, message, 'Options have been changed')
    case MessageTypes.differentStringlength:
      return getMessageLocal(spec, message, 'String length has been changed')
    case MessageTypes.differentManufacturer:
      return getMessageLocal(spec, message, 'Manufacturer has been changed')
    case MessageTypes.differentModel:
      return getMessageLocal(spec, message, 'Model has been changed')
    case MessageTypes.differentTranslation:
      return getMessageLocal(spec, message, 'Translation has been changed')

    case MessageTypes.noMqttDiscoveryLanguage:
      return getMessageLocal(spec, message, 'MQTT Discovery Langauge is not configured')
  }
  return 'unknown MessageType : ' + message.type
}

function getMessageLocal(spec: IbaseSpecification, message: Imessage, messageText: string): string {
  if (message.referencedEntity != undefined)
    return messageText + ' ' + getSpecificationI18nEntityName(spec, 'en', message.referencedEntity)
  if (message.additionalInformation != undefined) return messageText + ' ' + message.additionalInformation
  return messageText
}
