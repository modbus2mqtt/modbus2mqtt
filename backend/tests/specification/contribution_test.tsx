import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import * as fs from 'fs'
import { join } from 'path'
import { FileLocation, Inumber, SpecificationFileUsage, SpecificationStatus } from '../../src/shared/specification/index.js'
import { IfileSpecification } from '../../src/specification/index.js'
import { configDir, dataDir } from './configsbase.js'
import { TempConfigDirHelper } from '../server/testhelper.js'
import { specFixture } from './specFixtures.js'

const { mockInit, mockCommitFiles, mockCreatePullrequest, mockDeleteSpecBranch, mockGetPullRequest, mockFetchPublicFiles } =
  vi.hoisted(() => ({
    mockInit: vi.fn(),
    mockCommitFiles: vi.fn(),
    mockCreatePullrequest: vi.fn(),
    mockDeleteSpecBranch: vi.fn(),
    mockGetPullRequest: vi.fn(),
    mockFetchPublicFiles: vi.fn(),
  }))

vi.mock('../../src/specification/m2mgithub.js', () => ({
  M2mGitHub: class {
    constructor(
      public token: string | null,
      public publicRoot: string
    ) {}
    init = mockInit
    commitFiles = mockCommitFiles
    createPullrequest = mockCreatePullrequest
    deleteSpecBranch = mockDeleteSpecBranch
    getPullRequest = mockGetPullRequest
    fetchPublicFiles = mockFetchPublicFiles
    static getPullRequestUrl = vi.fn((pullNumber: number) => 'https://github.com/pull/' + pullNumber)
  },
}))

// import AFTER the mock so M2mSpecification gets the mocked M2mGitHub
import { ConfigSpecification, M2mSpecification } from '../../src/specification/index.js'

let tempDirs: TempConfigDirHelper

beforeAll(() => {
  ConfigSpecification['configDir'] = configDir
  ConfigSpecification['dataDir'] = dataDir
  tempDirs = new TempConfigDirHelper('contribution-test')
  tempDirs.setup()
  ConfigSpecification.setMqttdiscoverylanguage('en', 'fake-token')
  new ConfigSpecification().readYaml()
})
afterAll(() => {
  tempDirs.cleanup()
})
beforeEach(() => {
  mockInit.mockReset().mockResolvedValue(undefined)
  mockCommitFiles.mockReset().mockResolvedValue(undefined)
  mockCreatePullrequest.mockReset().mockResolvedValue(42)
  mockDeleteSpecBranch.mockReset().mockResolvedValue(undefined)
  mockGetPullRequest.mockReset()
  mockFetchPublicFiles.mockReset()
  ConfigSpecification.githubPersonalToken = 'fake-token'
})

/** stores a clean spec with unique name directly in the config state */
function storeSpec(filename: string, status: SpecificationStatus, extra?: Partial<IfileSpecification>): IfileSpecification {
  const s = structuredClone(specFixture)
  s.filename = filename
  s.status = status
  if (extra) Object.assign(s, extra)
  s.i18n[0].texts = s.i18n[0].texts!.map((t) => (t.textId == 'name' ? { textId: 'name', text: 'Name ' + filename } : t))
  const idx = ConfigSpecification['specifications'].findIndex((sp: IfileSpecification) => sp.filename == filename)
  if (idx >= 0) ConfigSpecification['specifications'].splice(idx, 1)
  ConfigSpecification['specifications'].push(s)
  return s
}

describe('contribute', () => {
  it('added spec: creates pull request and sets status contributed', async () => {
    const spec = storeSpec('add-spec', SpecificationStatus.added)
    const issue = await new M2mSpecification(spec).contribute('optional note')
    expect(issue).toBe(42)
    expect(mockInit).toHaveBeenCalled()
    expect(mockCommitFiles).toHaveBeenCalled()
    const [title, message] = mockCreatePullrequest.mock.calls[0]
    expect(title).toBe('Add specification Name add-spec')
    expect(message).toContain('First contribution of Name add-spec(add-spec)')
    expect(message).toContain('Languages:  en')
    const stored = ConfigSpecification.getSpecificationByFilename('add-spec')!
    expect(stored.status).toBe(SpecificationStatus.contributed)
    expect(stored.pullNumber).toBe(42)
  })

  it('cloned spec: message lists changes against public specification and appends the note', async () => {
    const pub = structuredClone(specFixture)
    pub.filename = 'clone-spec'
    ;(pub.entities[0].converterParameters as Inumber).multiplier = 2
    const spec = storeSpec('clone-spec', SpecificationStatus.cloned, { publicSpecification: pub })
    await new M2mSpecification(spec).contribute('my update note')
    const [title, message] = mockCreatePullrequest.mock.calls[0]
    expect(title).toBe('Update specification Name clone-spec')
    expect(message).toContain('Changes:')
    expect(message).toContain('Multiplier has been changed e1')
    expect(message).toContain('my update note')
  })

  it('rolls back and deletes the branch when createPullrequest fails', async () => {
    const spec = storeSpec('fail-spec', SpecificationStatus.added)
    mockCreatePullrequest.mockRejectedValue(new Error('gh failed'))
    await expect(new M2mSpecification(spec).contribute(undefined)).rejects.toThrow('gh failed')
    expect(mockDeleteSpecBranch).toHaveBeenCalledWith('fail-spec')
    expect(ConfigSpecification.getSpecificationByFilename('fail-spec')!.status).not.toBe(SpecificationStatus.contributed)
  })

  it('fails without mqtt discovery language', async () => {
    const spec = storeSpec('no-lang-spec', SpecificationStatus.added)
    const oldLang = ConfigSpecification.mqttdiscoverylanguage
    ConfigSpecification.setMqttdiscoverylanguage(undefined as unknown as string, 'fake-token')
    try {
      await expect(new M2mSpecification(spec).contribute(undefined)).rejects.toThrow(/Validation failed with errors/)
    } finally {
      ConfigSpecification.setMqttdiscoverylanguage(oldLang!, 'fake-token')
    }
    expect(mockCreatePullrequest).not.toHaveBeenCalled()
  })

  it('fails with validation errors (spec without files)', async () => {
    const spec = storeSpec('no-files-spec', SpecificationStatus.added)
    spec.files = []
    await expect(new M2mSpecification(spec).contribute(undefined)).rejects.toThrow(/Validation failed with errors/)
  })

  it('fails without github token', async () => {
    const spec = storeSpec('no-token-spec', SpecificationStatus.added)
    ConfigSpecification.githubPersonalToken = undefined as unknown as string
    await expect(new M2mSpecification(spec).contribute(undefined)).rejects.toThrow(/Github connection is not configured/)
  })
})

describe('closeContribution', () => {
  it('fails without github token', async () => {
    const spec = storeSpec('cc-no-token', SpecificationStatus.contributed, { pullNumber: 7 })
    ConfigSpecification.githubPersonalToken = undefined as unknown as string
    await expect(M2mSpecification.closeContribution(spec)).rejects.toMatchObject({
      step: 'closeContribution',
      message: expect.stringContaining('No Github Personal Access Token'),
    })
  })

  it('fails without pull number', async () => {
    const spec = storeSpec('cc-no-pull', SpecificationStatus.contributed)
    delete spec.pullNumber
    await expect(M2mSpecification.closeContribution(spec)).rejects.toMatchObject({
      step: 'closeContribution',
      message: expect.stringContaining('No Pull Number'),
    })
  })

  it('merged pull request publishes the spec and deletes the branch', async () => {
    const spec = storeSpec('cc-merged', SpecificationStatus.contributed, { pullNumber: 7 })
    mockGetPullRequest.mockResolvedValue({ merged: true, closed_at: null })
    const result = await M2mSpecification.closeContribution(spec)
    expect(result).toEqual({ merged: true, closed: false, pullNumber: 7 })
    expect(ConfigSpecification.getSpecificationByFilename('cc-merged')!.status).toBe(SpecificationStatus.published)
    expect(mockDeleteSpecBranch).toHaveBeenCalledWith('cc-merged')
    expect(mockFetchPublicFiles).toHaveBeenCalled()
  })

  it('closed (unmerged) pull request resets the spec to added', async () => {
    const spec = storeSpec('cc-closed', SpecificationStatus.contributed, { pullNumber: 8 })
    mockGetPullRequest.mockResolvedValue({ merged: false, closed_at: '2026-01-01T00:00:00Z' })
    const result = await M2mSpecification.closeContribution(spec)
    expect(result.closed).toBeTruthy()
    expect(result.merged).toBeFalsy()
    expect(ConfigSpecification.getSpecificationByFilename('cc-closed')!.status).toBe(SpecificationStatus.added)
    expect(mockDeleteSpecBranch).toHaveBeenCalledWith('cc-closed')
  })

  it('open pull request changes nothing and keeps the branch', async () => {
    const spec = storeSpec('cc-open', SpecificationStatus.contributed, { pullNumber: 9 })
    mockGetPullRequest.mockResolvedValue({ merged: false, closed_at: null })
    const result = await M2mSpecification.closeContribution(spec)
    expect(result).toEqual({ merged: false, closed: false, pullNumber: 9 })
    expect(ConfigSpecification.getSpecificationByFilename('cc-open')!.status).toBe(SpecificationStatus.contributed)
    expect(mockDeleteSpecBranch).not.toHaveBeenCalled()
    expect(mockFetchPublicFiles).toHaveBeenCalled()
  })

  it('wraps github errors', async () => {
    const spec = storeSpec('cc-error', SpecificationStatus.contributed, { pullNumber: 10 })
    mockGetPullRequest.mockRejectedValue(new Error('rate limited'))
    await expect(M2mSpecification.closeContribution(spec)).rejects.toMatchObject({
      step: 'closeContribution',
      message: 'closeContribution: rate limited',
    })
  })
})

describe('getSpecificationsFilesList', () => {
  it('includes existing local files and always the spec json', () => {
    const spec = storeSpec('files-spec', SpecificationStatus.added)
    const localDir = ConfigSpecification.getLocalDir()
    fs.mkdirSync(join(localDir, 'files'), { recursive: true })
    fs.writeFileSync(join(localDir, 'files', 'doc.pdf'), 'pdf')
    spec.files = [
      { url: 'files/doc.pdf', usage: SpecificationFileUsage.documentation, fileLocation: FileLocation.Local },
      { url: 'files/missing.pdf', usage: SpecificationFileUsage.img, fileLocation: FileLocation.Local },
    ]
    const list = new M2mSpecification(spec).getSpecificationsFilesList(localDir)
    expect(list).toContain('files/doc.pdf')
    expect(list).not.toContain('files/missing.pdf')
    expect(list).toContain(join('specifications', 'files-spec.json'))
  })
})
