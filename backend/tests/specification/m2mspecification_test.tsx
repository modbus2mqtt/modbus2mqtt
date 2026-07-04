import { it, expect, beforeAll, describe, afterAll } from 'vitest'
import { Itext, MessageTypes } from '../../src/shared/specification/index.js'
import { ConfigSpecification } from '../../src/specification/index.js'
import { ImodbusValues, M2mSpecification, emptyModbusValues } from '../../src/specification/index.js'
import { IdentifiedStates } from '../../src/shared/specification/index.js'
import { singleMutex, configDir } from './configsbase.js'
import { IfileSpecification } from '../../src/specification/index.js'
import { entText, specFixture } from './specFixtures.js'

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GITHUB_TOKEN: string
    }
  }
}
ConfigSpecification.setMqttdiscoverylanguage('en', process.env.GITHUB_TOKEN)
ConfigSpecification['configDir'] = configDir

beforeAll(() => {
  new ConfigSpecification().readYaml()
})

describe('copyModbusDataToEntity', () => {
  beforeAll(() => {
    singleMutex.acquire()
    new ConfigSpecification().readYaml()
  })
  afterAll(() => {
    singleMutex.release()
  })

  it('identification string identified', () => {
    const tspec = structuredClone(specFixture)
    const ent = structuredClone(entText)
    tspec.entities = [ent]
    const values: ImodbusValues = emptyModbusValues()
    ;(ent.converterParameters as Itext).identification = 'ABCD'
    const v: number[] = [(65 << 8) | 66, (67 << 8) | 68]
    values.holdingRegisters.set(5, { data: [v[0]] })
    values.holdingRegisters.set(6, { data: [v[1]] })

    const e = M2mSpecification.copyModbusDataToEntity(tspec, 2, values)
    expect(e.identified).toBe(IdentifiedStates.identified)
  })

  it('identification string not identified', () => {
    const tspec = structuredClone(specFixture)
    const ent = structuredClone(entText)
    tspec.entities = [ent]
    const values: ImodbusValues = emptyModbusValues()
    ;(ent.converterParameters as Itext).identification = 'WXYZ'
    values.holdingRegisters.set(5, { data: [(65 << 8) | 66] })
    values.holdingRegisters.set(6, { data: [(67 << 8) | 68] })

    const e = M2mSpecification.copyModbusDataToEntity(tspec, 2, values)
    expect(e.identified).toBe(IdentifiedStates.notIdentified)
  })

  it('no data for address yields notIdentified with empty values', () => {
    const tspec = structuredClone(specFixture)
    const values: ImodbusValues = emptyModbusValues()
    const e = M2mSpecification.copyModbusDataToEntity(tspec, 1, values)
    expect(e.identified).toBe(IdentifiedStates.notIdentified)
    expect(e.modbusValue).toEqual([])
  })

  it('unknown entity id throws', () => {
    const tspec = structuredClone(specFixture)
    expect(() => M2mSpecification.copyModbusDataToEntity(tspec, 99, emptyModbusValues())).toThrow(/EntityId 99/)
  })
})

describe('validate', () => {
  beforeAll(() => {
    singleMutex.acquire()
    new ConfigSpecification().readYaml()
  })
  afterAll(() => {
    singleMutex.release()
  })

  function messageTypes(spec: IfileSpecification, language = 'en'): MessageTypes[] {
    return new M2mSpecification(structuredClone(spec)).validate(language).map((m) => m.type)
  }

  it('well-formed spec with matching testdata yields no messages', () => {
    expect(messageTypes(specFixture)).toEqual([])
  })

  it('spec without files yields noDocumentation and noImage', () => {
    const tspec = structuredClone(specFixture)
    tspec.files = []
    const types = messageTypes(tspec)
    expect(types).toContain(MessageTypes.noDocumentation)
    expect(types).toContain(MessageTypes.noImage)
  })

  it('spec without entities yields noEntity', () => {
    const tspec = structuredClone(specFixture)
    tspec.entities = []
    expect(messageTypes(tspec)).toContain(MessageTypes.noEntity)
  })

  it('testdata outside identification range yields notIdentified', () => {
    const tspec = structuredClone(specFixture)
    // entity 1: multiplier 0.1, identification max 200 -> 5000*0.1=500 > 200
    tspec.testdata.holdingRegisters!.find((d) => d.address == 3)!.value = 5000
    expect(messageTypes(tspec)).toContain(MessageTypes.notIdentified)
  })

  it('duplicate specification name yields nonUniqueName', () => {
    const clone = structuredClone(specFixture)
    clone.filename = 'anotherfilename'
    ConfigSpecification['specifications'].push(clone)
    try {
      expect(messageTypes(specFixture)).toContain(MessageTypes.nonUniqueName)
    } finally {
      const idx = ConfigSpecification['specifications'].findIndex((s: IfileSpecification) => s.filename == 'anotherfilename')
      if (idx >= 0) ConfigSpecification['specifications'].splice(idx, 1)
    }
  })

  it('missing entity translation yields entityTextMissing', () => {
    const tspec = structuredClone(specFixture)
    tspec.i18n[0].texts = tspec.i18n[0].texts!.filter((t) => t.textId != 'e1')
    expect(messageTypes(tspec)).toContain(MessageTypes.entityTextMissing)
  })

  it('missing specification name yields nameTextMissing', () => {
    const tspec = structuredClone(specFixture)
    tspec.i18n[0].texts = tspec.i18n[0].texts!.filter((t) => t.textId != 'name')
    expect(messageTypes(tspec)).toContain(MessageTypes.nameTextMissing)
  })

  it('validate(language) always validates english too (contribution rule)', () => {
    const tspec = structuredClone(specFixture)
    // German translation is complete, but english name is missing
    tspec.i18n.push({ lang: 'de', texts: structuredClone(tspec.i18n[0].texts) })
    tspec.i18n[0].texts = tspec.i18n[0].texts!.filter((t) => t.textId != 'name')
    const types = messageTypes(tspec, 'de')
    expect(types.length).toBeGreaterThan(0)
  })
})
