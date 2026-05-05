import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { M2mGithubValidate } from '../../src/specification/m2mGithubValidate.js'
import { M2mSpecification } from '../../src/specification/m2mspecification.js'
import { IfileSpecification } from '../../src/specification/ifilespecification.js'
import {
  SPECIFICATION_VERSION,
  SpecificationStatus,
  ModbusRegisterType,
  MessageTypes,
} from '../../src/shared/specification/index.js'
import * as fs from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

const TEST_REPO = process.env.TEST_CONFIG_REPO || 'modbus2mqtt/modbus2mqtt.config.test'
const TEST_RUN_ID = `inttest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** Minimal valid IfileSpecification for testing */
const testSpec: IfileSpecification = {
  filename: 'inttest-valid',
  entities: [
    {
      id: 1,
      mqttname: 'temperature',
      converter: { name: 'number', registerTypes: [] },
      modbusAddress: 0,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      icon: '',
      converterParameters: { multiplier: 0.1 },
    },
  ],
  i18n: [
    {
      lang: 'en',
      texts: [
        { textId: 'name', text: 'Integration Test Spec' },
        { textId: 'e1', text: 'Temperature' },
      ],
    },
  ],
  files: [],
  status: SpecificationStatus.added,
  nextEntityId: 2,
  version: SPECIFICATION_VERSION,
  testdata: {
    holdingRegisters: [{ address: 0, value: 250 }],
    analogInputs: [],
    coils: [],
    discreteInputs: [],
  },
} as unknown as IfileSpecification

describe('JSON spec validation (local, no GitHub needed)', () => {
  it('validates a well-formed JSON spec without errors', () => {
    const m2mSpec = new M2mSpecification(testSpec)
    const messages = m2mSpec.validateSpecification('en')

    // Filter out acceptable warnings (noDocumentation, noImage)
    const errors = messages.filter(
      (m) => m.type !== MessageTypes.noDocumentation && m.type !== MessageTypes.noImage
    )
    expect(errors).toHaveLength(0)
  })

  it('detects missing entities', () => {
    const emptySpec = {
      ...testSpec,
      filename: 'empty-entities-spec',
      entities: [],
    } as unknown as IfileSpecification

    const m2mSpec = new M2mSpecification(emptySpec)
    const messages = m2mSpec.validateSpecification('en')

    expect(messages.some((m) => m.type === MessageTypes.noEntity)).toBe(true)
  })
})

const hasToken = !!process.env.GITHUB_TOKEN

describe.skipIf(!hasToken)('GitHub integration (requires GITHUB_TOKEN)', () => {
  let gh: M2mGithubValidate
  const branchName = `test/${TEST_RUN_ID}`
  let prNumber: number | undefined
  let prClosed = false

  beforeAll(async () => {

    gh = new M2mGithubValidate(TEST_REPO)

    // 1. Clone test repo into temp dir (with token for push access)
    const tmpDir = fs.mkdtempSync(join(tmpdir(), 'm2m-inttest-'))
    try {
      const token = process.env.GITHUB_TOKEN
      const cloneUrl = `https://x-access-token:${token}@github.com/${TEST_REPO}.git`
      await execFile('git', ['clone', '--depth', '1', cloneUrl, tmpDir], { encoding: 'utf-8' })
      await execFile('git', ['config', 'user.email', 'inttest@modbus2mqtt.dev'], { cwd: tmpDir, encoding: 'utf-8' })
      await execFile('git', ['config', 'user.name', 'Integration Test'], { cwd: tmpDir, encoding: 'utf-8' })

      // 2. Create branch and add test spec file
      await execFile('git', ['checkout', '-b', branchName], { cwd: tmpDir, encoding: 'utf-8' })

      const specDir = join(tmpDir, 'specifications')
      fs.mkdirSync(specDir, { recursive: true })
      fs.writeFileSync(join(specDir, 'inttest-valid.json'), JSON.stringify(testSpec, null, 2))

      // 3. Commit and push
      await execFile('git', ['add', '.'], { cwd: tmpDir, encoding: 'utf-8' })
      await execFile('git', ['commit', '-m', `test: add integration test spec (${TEST_RUN_ID})`], {
        cwd: tmpDir,
        encoding: 'utf-8',
      })
      await execFile('git', ['push', 'origin', branchName], { cwd: tmpDir, encoding: 'utf-8' })

      // 4. Create PR via gh CLI
      const { stdout } = await execFile(
        'gh',
        [
          'pr',
          'create',
          '--repo',
          TEST_REPO,
          '--base',
          'main',
          '--head',
          branchName,
          '--title',
          `Integration test ${TEST_RUN_ID}`,
          '--body',
          'Automated integration test PR. Will be closed automatically.',
        ],
        { encoding: 'utf-8' }
      )

      // gh pr create outputs the PR URL, extract the number
      const match = stdout.trim().match(/\/pull\/(\d+)$/)
      if (!match) throw new Error(`Could not parse PR number from: ${stdout}`)
      prNumber = parseInt(match[1])
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 60_000)

  afterAll(async () => {
    // Close PR if still open
    if (prNumber && !prClosed) {
      try {
        await gh.closePullRequest(prNumber)
      } catch {
        /* already closed or deleted */
      }
    }
    // Delete branch
    try {
      await execFile('gh', ['api', '-X', 'DELETE', `repos/${TEST_REPO}/git/refs/heads/${branchName}`], {
        encoding: 'utf-8',
      })
    } catch {
      /* branch may already be deleted */
    }
  }, 30_000)

  it('listPullRequestFiles returns the spec file we added', async () => {
    expect(prNumber).toBeDefined()
    const result = await gh.listPullRequestFiles('ignored', prNumber!)
    expect(result.pr_number).toBe(prNumber)
    expect(result.files).toContain('specifications/inttest-valid.json')
  })

  it('addIssueComment posts a comment on the PR', async () => {
    expect(prNumber).toBeDefined()
    await gh.addIssueComment(prNumber!, `Integration test comment (${TEST_RUN_ID})`)

    // Verify by reading comments
    const { stdout } = await execFile(
      'gh',
      ['api', `repos/${TEST_REPO}/issues/${prNumber}/comments`, '--jq', '.[].body'],
      { encoding: 'utf-8' }
    )
    expect(stdout).toContain(`Integration test comment (${TEST_RUN_ID})`)
  })

  it('closePullRequest closes the PR', async () => {
    expect(prNumber).toBeDefined()
    await gh.closePullRequest(prNumber!)

    // Verify PR is closed
    const { stdout } = await execFile(
      'gh',
      ['api', `repos/${TEST_REPO}/pulls/${prNumber}`, '--jq', '.state'],
      { encoding: 'utf-8' }
    )
    expect(stdout.trim()).toBe('closed')
    prClosed = true
  })
})
