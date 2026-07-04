import { describe, it, expect } from 'vitest'
import {
  Imessage,
  Inumber,
  Iselect,
  Itext,
  MessageTypes,
  ModbusRegisterType,
  VariableTargetParameters,
} from '../../src/shared/specification/index.js'
import { IfileSpecification, M2mSpecification } from '../../src/specification/index.js'
import { entText, specFixture } from './specFixtures.js'

/** compare a mutated clone against the fixture; returns the diff messages */
function diff(mutateOther: (other: IfileSpecification) => void, mutateSelf?: (self: IfileSpecification) => void): Imessage[] {
  const self = structuredClone(specFixture)
  const other = structuredClone(specFixture)
  mutateOther(other)
  if (mutateSelf) mutateSelf(self)
  return new M2mSpecification(self).isEqual(other)
}

function types(msgs: Imessage[]): MessageTypes[] {
  return msgs.map((m) => m.type)
}

describe('isEqual', () => {
  it('identical specifications yield no messages', () => {
    expect(diff(() => {})).toEqual([])
  })

  it('different filename', () => {
    const msgs = diff((o) => (o.filename = 'otherfile'))
    expect(types(msgs)).toContain(MessageTypes.differentFilename)
  })

  it('entity missing in other reports addedEntity', () => {
    const msgs = diff((o) => o.entities.splice(2, 1))
    const added = msgs.find((m) => m.type == MessageTypes.addedEntity)
    expect(added?.referencedEntity).toBe(3)
  })

  it('extra entity in other reports missingEntity with its name', () => {
    const msgs = diff((o) => {
      o.entities.push(structuredClone(entText))
      o.entities[o.entities.length - 1].id = 4
      o.i18n[0].texts!.push({ textId: 'e4', text: 'text entity' })
    })
    const missing = msgs.find((m) => m.type == MessageTypes.missingEntity)
    expect(missing).toBeDefined()
    expect(missing?.additionalInformation).toBe('text entity')
  })

  it.each([
    [MessageTypes.differentConverter, (o: IfileSpecification) => ((o.entities[0] as { converter: string }).converter = 'text')],
    [MessageTypes.differentModbusAddress, (o: IfileSpecification) => (o.entities[0].modbusAddress = 99)],
    [MessageTypes.differentFunctionCode, (o: IfileSpecification) => (o.entities[0].registerType = ModbusRegisterType.AnalogInputs)],
    [MessageTypes.differentIcon, (o: IfileSpecification) => (o.entities[0].icon = 'mdi:new-icon')],
  ])('entity attribute change yields %i', (expected, mutate) => {
    const msgs = diff(mutate)
    const m = msgs.find((mm) => mm.type == expected)
    expect(m?.referencedEntity).toBe(1)
  })

  describe('variableConfiguration', () => {
    const withVar = (s: IfileSpecification, targetParameter: VariableTargetParameters, entityId = 1) => {
      s.entities[2].variableConfiguration = { targetParameter, entityId }
    }
    it('different target parameter', () => {
      const msgs = diff(
        (o) => withVar(o, VariableTargetParameters.entityUom),
        (s) => withVar(s, VariableTargetParameters.entityMultiplier)
      )
      expect(types(msgs)).toContain(MessageTypes.differentTargetParameter)
    })
    it('different referenced entity', () => {
      const msgs = diff(
        (o) => withVar(o, VariableTargetParameters.entityUom, 1),
        (s) => withVar(s, VariableTargetParameters.entityUom, 2)
      )
      expect(types(msgs)).toContain(MessageTypes.differentVariableEntityId)
    })
    it('one-sided variable configuration', () => {
      const msgs = diff((o) => withVar(o, VariableTargetParameters.entityUom))
      expect(types(msgs)).toContain(MessageTypes.differentVariableConfiguration)
    })
  })

  describe('Inumber parameters (entity 1)', () => {
    const num = (s: IfileSpecification) => s.entities[0].converterParameters as Inumber
    it.each([
      [MessageTypes.differentDeviceClass, (o: IfileSpecification) => (num(o).device_class = 'temperature')],
      [MessageTypes.differentIdentificationMax, (o: IfileSpecification) => (num(o).identification!.max = 999)],
      [MessageTypes.differentIdentificationMin, (o: IfileSpecification) => (num(o).identification!.min = -5)],
      [MessageTypes.differentIdentification, (o: IfileSpecification) => delete num(o).identification],
      [MessageTypes.differentMultiplier, (o: IfileSpecification) => (num(o).multiplier = 2)],
      [MessageTypes.differentOffset, (o: IfileSpecification) => (num(o).offset = 10)],
    ])('yields %i', (expected, mutate) => {
      const m = diff(mutate).find((mm) => mm.type == expected)
      expect(m?.referencedEntity).toBe(1)
    })
  })

  it('Iselect: changed option table (entity 2)', () => {
    const msgs = diff((o) => ((o.entities[1].converterParameters as Iselect).optionModbusValues = [7, 8]))
    const m = msgs.find((mm) => mm.type == MessageTypes.differentOptionTable)
    expect(m?.referencedEntity).toBe(2)
  })

  describe('Itext parameters', () => {
    const withText = (s: IfileSpecification) => {
      const t = structuredClone(entText)
      t.id = 4
      s.entities.push(t)
      s.i18n[0].texts!.push({ textId: 'e4', text: 'text entity' })
    }
    it('different stringlength', () => {
      const msgs = diff(
        (o) => {
          withText(o)
          ;(o.entities[3].converterParameters as Itext).stringlength = 99
        },
        (s) => withText(s)
      )
      const m = msgs.find((mm) => mm.type == MessageTypes.differentStringlength)
      expect(m?.referencedEntity).toBe(4)
    })
    it('different identification', () => {
      const msgs = diff(
        (o) => {
          withText(o)
          ;(o.entities[3].converterParameters as Itext).identification = 'XYZ'
        },
        (s) => withText(s)
      )
      const m = msgs.find((mm) => mm.type == MessageTypes.differentIdentification)
      expect(m?.referencedEntity).toBe(4)
    })
  })

  it.each([
    [MessageTypes.differentTranslation, (o: IfileSpecification) => (o.i18n[0].texts![1].text = 'changed')],
    [MessageTypes.differentManufacturer, (o: IfileSpecification) => (o.manufacturer = 'someone else')],
    [MessageTypes.differentModel, (o: IfileSpecification) => (o.model = 'X1000')],
  ])('spec level change yields %i', (expected, mutate) => {
    expect(types(diff(mutate))).toContain(expected)
  })
})

describe('isEqualValue (loose equality semantics)', () => {
  const mspec = new M2mSpecification(structuredClone(specFixture))
  it('null and undefined are equal', () => {
    expect(mspec.isEqualValue(null, undefined)).toBeTruthy()
    expect(mspec.isEqualValue(undefined, undefined)).toBeTruthy()
  })
  it('loose == comparison: 0 equals empty string (pinned current behavior)', () => {
    expect(mspec.isEqualValue(0, '')).toBeTruthy()
    expect(mspec.isEqualValue(1, '1')).toBeTruthy()
  })
  it('different values are not equal', () => {
    expect(mspec.isEqualValue(1, 2)).toBeFalsy()
    expect(mspec.isEqualValue('a', null)).toBeFalsy()
  })
})
