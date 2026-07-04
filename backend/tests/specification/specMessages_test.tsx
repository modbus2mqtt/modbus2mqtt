import { describe, it, expect } from 'vitest'
import { Imessage, MessageCategories, MessageTypes } from '../../src/shared/specification/index.js'
import { M2mSpecification } from '../../src/specification/index.js'
import { specFixture } from './specFixtures.js'

const spec = specFixture

function msg(type: MessageTypes, extra: Partial<Imessage> = {}): Imessage {
  return { type, category: MessageCategories.validateSpecification, ...extra }
}

describe('getMessageString', () => {
  it.each([
    [MessageTypes.noDocumentation, 'No documenation file or URL'],
    [MessageTypes.nameTextMissing, 'The specification has no Name'],
    [MessageTypes.entityTextMissing, 'entity has no name'],
    [MessageTypes.noEntity, 'No entity defined for this specification'],
    [MessageTypes.noImage, 'No image file or URL'],
    [MessageTypes.nonUniqueName, 'Specification name is not unique'],
    [MessageTypes.notIdentified, " The specification can not be identified with it's test data"],
  ])('direct text for type %i', (type, expected) => {
    expect(M2mSpecification.getMessageString(spec, msg(type))).toBe(expected)
  })

  it('translationMissing joins additionalInformation array', () => {
    expect(M2mSpecification.getMessageString(spec, msg(MessageTypes.translationMissing, { additionalInformation: ['a', 'b'] }))).toBe(
      'A translation is missing: a, b'
    )
    expect(M2mSpecification.getMessageString(spec, msg(MessageTypes.translationMissing))).toBe('A translation is missing: ')
  })

  it('identifiedByOthers lists matching specification names', () => {
    expect(
      M2mSpecification.getMessageString(spec, msg(MessageTypes.identifiedByOthers, { additionalInformation: ['spec1', 'spec2'] }))
    ).toBe('Test data of this specification matches to the following other public specifications spec1 spec2')
  })

  const localizedCases: [MessageTypes, string][] = [
    [MessageTypes.differentFilename, 'Filename has been changed. A new public specification will be created'],
    [MessageTypes.missingEntity, 'Entity has been removed'],
    [MessageTypes.differentConverter, 'Converter has been changed'],
    [MessageTypes.addedEntity, 'Entity has been added'],
    [MessageTypes.differentModbusAddress, 'Modbus address has been changed'],
    [MessageTypes.differentFunctionCode, 'Function code has been changed'],
    [MessageTypes.differentIcon, 'Icon has been changed'],
    [MessageTypes.differentTargetParameter, 'Variable configuration: Target parameter has been changed'],
    [MessageTypes.differentVariableEntityId, 'Variable configuration: Referenced entity has been changed'],
    [MessageTypes.differentVariableConfiguration, 'Variable configuration has been changed'],
    [MessageTypes.differentDeviceClass, 'Device class has been changed'],
    [MessageTypes.differentIdentificationMax, 'Max value has been changed'],
    [MessageTypes.differentIdentificationMin, 'Min value has been changed'],
    [MessageTypes.differentIdentification, 'Identification has been changed'],
    [MessageTypes.differentMultiplier, 'Multiplier has been changed'],
    [MessageTypes.differentOffset, 'Offset has been changed'],
    [MessageTypes.differentOptionTable, 'Options have been changed'],
    [MessageTypes.differentStringlength, 'String length has been changed'],
    [MessageTypes.differentManufacturer, 'Manufacturer has been changed'],
    [MessageTypes.differentModel, 'Model has been changed'],
    [MessageTypes.differentTranslation, 'Translation has been changed'],
    [MessageTypes.noMqttDiscoveryLanguage, 'MQTT Discovery Langauge is not configured'],
  ]

  it.each(localizedCases)('localized type %i with referencedEntity appends the entity name', (type, text) => {
    expect(M2mSpecification.getMessageString(spec, msg(type, { referencedEntity: 1 }))).toBe(text + ' e1')
  })

  it.each(localizedCases.slice(0, 3))('localized type %i with additionalInformation appends it', (type, text) => {
    expect(M2mSpecification.getMessageString(spec, msg(type, { additionalInformation: 'extra info' }))).toBe(text + ' extra info')
  })

  it('localized message WITHOUT referencedEntity/additionalInformation returns the message text', () => {
    expect(M2mSpecification.getMessageString(spec, msg(MessageTypes.noMqttDiscoveryLanguage))).toBe(
      'MQTT Discovery Langauge is not configured'
    )
  })

  it('unknown message type yields fallback text', () => {
    expect(M2mSpecification.getMessageString(spec, msg(999 as MessageTypes))).toBe('unknown MessageType : 999')
  })
})

describe('messages2Text', () => {
  it('joins messages with newline and filters identifiedByOthers', () => {
    const text = M2mSpecification.messages2Text(spec, [
      msg(MessageTypes.noEntity),
      msg(MessageTypes.identifiedByOthers, { additionalInformation: ['other'] }),
      msg(MessageTypes.noImage),
    ])
    expect(text).toBe('No entity defined for this specification\nNo image file or URL\n')
  })

  it('returns empty string for no messages', () => {
    expect(M2mSpecification.messages2Text(spec, [])).toBe('')
  })
})
