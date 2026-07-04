import { it, expect, beforeAll, describe, afterAll } from 'vitest'
import { Itext, MessageTypes, SpecificationStatus } from '../../src/shared/specification/index.js'
import { ConfigSpecification } from '../../src/specification/index.js'
import { ImodbusValues, M2mSpecification, emptyModbusValues } from '../../src/specification/index.js'
import { IdentifiedStates } from '../../src/shared/specification/index.js'
import { singleMutex, configDir } from './configsbase.js'
import { IfileSpecification } from '../../src/specification/index.js'
import { IpullRequest } from '../../src/specification/m2mGithubValidate.js'
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

class TestM2mSpecification {
  static rcs: { merged: boolean; closed: boolean }[] = [
    { merged: false, closed: false }, //0
    { merged: true, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: false }, //5
    { merged: false, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: true },
  ]
  private static idx = 0
  static closeContribution(): Promise<IpullRequest> {
    return new Promise<IpullRequest>((resolve, reject) => {
      if (TestM2mSpecification.idx >= TestM2mSpecification.rcs.length) reject(new Error('not enough test data provided'))
      resolve({
        pullNumber: 16,
        merged: TestM2mSpecification.rcs[TestM2mSpecification.idx].merged,
        closed: TestM2mSpecification.rcs[TestM2mSpecification.idx++].closed,
      })
    })
  }
  static pollOriginal: (specfilename: string, error: (e: unknown) => void) => void
  static poll(specfilename: string, error: (e: unknown) => void): void {
    const contribution = M2mSpecification['ghContributions'].get(specfilename)
    //Speed up test set short intervals
    contribution!.m2mSpecification['ghPollInterval'] = [1, 2, 3, 4]
    TestM2mSpecification.pollOriginal(specfilename, error)
  }
}
it('startPolling', async () => {
  const specP = structuredClone(specFixture)
  specP.pullNumber = 16
  specP.status = SpecificationStatus.contributed
  ConfigSpecification['specifications'].push(specP)
  ConfigSpecification.githubPersonalToken = 'abcd'
  M2mSpecification.closeContribution = TestM2mSpecification.closeContribution
  TestM2mSpecification.pollOriginal = M2mSpecification['poll']
  M2mSpecification['pollingTimeout'] = 100
  M2mSpecification['poll'] = TestM2mSpecification.poll
  let o = M2mSpecification.startPolling(specP.filename, () => {
    expect(true).toBeFalsy()
  })
  let callCount = 0
  let expectedCallCount = 2
  await new Promise<void>((resolve, reject) => {
    o?.subscribe({
      next(pullRequest) {
        switch (callCount) {
          case 0:
            expect(pullRequest.merged).toBeFalsy()
            break
          case 1:
            expect(pullRequest.merged).toBeTruthy()
            break
        }
        const i = M2mSpecification['ghContributions'].get(specP.filename)
        expect(i?.nextCheck).toBe('0.0 Sec')
        callCount++
        if (callCount > expectedCallCount) expect(callCount).toBe(expectedCallCount)
      },
      complete() {
        resolve()
      },
      error(err) {
        reject(err)
      },
    })
  })
  expect(M2mSpecification['ghContributions'].has(specP.filename)).toBeFalsy()
  expect(callCount).toBe(2)
  expectedCallCount = 11
  o = M2mSpecification.startPolling(specP.filename, () => {
    expect(true).toBeFalsy()
  })
  await new Promise<void>((resolve, reject) => {
    o?.subscribe({
      next(pullRequest) {
        switch (callCount) {
          case 0:
            expect(pullRequest.closed).toBeFalsy()
            break
          case 1:
            expect(pullRequest.closed).toBeTruthy()
            break
        }
        callCount++
        if (callCount > expectedCallCount) expect(callCount).toBe(expectedCallCount)
      },
      complete() {
        resolve()
      },
      error(err) {
        reject(err)
      },
    })
  })
  expect(callCount).toBe(expectedCallCount)
})
