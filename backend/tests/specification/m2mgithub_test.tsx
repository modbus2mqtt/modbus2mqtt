import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExecFile } = vi.hoisted(() => {
  return { mockExecFile: vi.fn() }
})

vi.mock('child_process', () => {
  const fn: any = vi.fn()
  fn[Symbol.for('nodejs.util.promisify.custom')] = mockExecFile
  return {
    execFile: fn,
    execSync: vi.fn(),
  }
})

import { M2mGitHub } from '../../src/specification/m2mgithub.js'

vi.mock('../../src/specification/configspec.js', () => ({
  ConfigSpecification: class {
    static getPublicDir = vi.fn(() => '/tmp/public')
    static getLocalDir = vi.fn(() => '/tmp/local')
    readYaml = vi.fn()
  },
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
    mkdtempSync: vi.fn(() => '/tmp/m2m-commit-test'),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  }
})

import { execSync } from 'child_process'
import * as fs from 'fs'

describe('M2mGitHub', () => {
  beforeEach(() => {
    mockExecFile.mockReset()
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('creates instance with token and publicRoot', () => {
      const gh = new M2mGitHub('test-token', '/tmp/public')
      expect(gh).toBeDefined()
    })

    it('creates instance without token', () => {
      const gh = new M2mGitHub(null, '/tmp/public')
      expect(gh).toBeDefined()
    })
  })

  describe('fetchPublicFiles', () => {
    it('clones repo when publicRoot does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(execSync).mockReturnValue(Buffer.from('Cloning...'))

      const gh = new M2mGitHub(null, '/tmp/public')
      gh.fetchPublicFiles()

      expect(execSync).toHaveBeenCalledWith(expect.stringContaining('git clone'))
    })

    it('pulls when publicRoot is a git repo', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(execSync).mockReturnValue(Buffer.from('Already up to date.'))

      const gh = new M2mGitHub(null, '/tmp/public')
      gh.fetchPublicFiles()

      expect(execSync).toHaveBeenCalledWith('git pull', expect.objectContaining({ cwd: '/tmp/public' }))
    })

    it('clones when publicRoot exists but is empty (e.g. pre-created by s6)', () => {
      // publicRoot exists, but no .git inside, and the directory is empty
      vi.mocked(fs.existsSync).mockImplementation((p) => !String(p).endsWith('.git'))
      vi.mocked(fs.readdirSync).mockReturnValue([] as any)
      vi.mocked(execSync).mockReturnValue(Buffer.from('Cloning...'))

      const gh = new M2mGitHub(null, '/tmp/public')
      gh.fetchPublicFiles()

      expect(execSync).toHaveBeenCalledWith(expect.stringContaining('git clone'))
    })

    it('skips when publicRoot exists with content but no .git (test fixtures)', () => {
      // publicRoot exists, no .git inside, but the directory has content
      vi.mocked(fs.existsSync).mockImplementation((p) => !String(p).endsWith('.git'))
      vi.mocked(fs.readdirSync).mockReturnValue(['specifications'] as any)

      const gh = new M2mGitHub(null, '/tmp/public')
      gh.fetchPublicFiles()

      expect(execSync).not.toHaveBeenCalled()
    })
  })

  describe('getPullRequestUrl', () => {
    it('returns correct URL', () => {
      const url = M2mGitHub.getPullRequestUrl(42)
      expect(url).toBe('https://github.com/modbus2mqtt/modbus2mqtt.config/pull/42')
    })
  })

  describe('hasSpecBranch', () => {
    it('returns true when branch exists', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'refs/heads/test-branch', stderr: '' })

      const gh = new M2mGitHub('test-token', '/tmp/public')
      gh['ownOwner'] = 'testuser'
      const result = await gh.hasSpecBranch('test-branch')

      expect(result).toBe(true)
    })

    it('returns false when branch does not exist (404)', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('HTTP 404: Not Found'))

      const gh = new M2mGitHub('test-token', '/tmp/public')
      gh['ownOwner'] = 'testuser'
      const result = await gh.hasSpecBranch('nonexistent')

      expect(result).toBe(false)
    })

    it('throws when no token configured', async () => {
      const gh = new M2mGitHub(null, '/tmp/public')
      await expect(gh.hasSpecBranch('test')).rejects.toThrow('No Github token configured')
    })
  })

  describe('deleteSpecBranch', () => {
    it('deletes branch when it exists', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: 'refs/heads/test-branch', stderr: '' }) // hasSpecBranch
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // delete

      const gh = new M2mGitHub('test-token', '/tmp/public')
      gh['ownOwner'] = 'testuser'
      await gh.deleteSpecBranch('test-branch')

      expect(mockExecFile).toHaveBeenCalledTimes(2)
      expect(mockExecFile).toHaveBeenLastCalledWith(
        'gh',
        expect.arrayContaining(['-X', 'DELETE']),
        expect.anything()
      )
    })

    it('does nothing when branch does not exist', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('404'))

      const gh = new M2mGitHub('test-token', '/tmp/public')
      gh['ownOwner'] = 'testuser'
      await gh.deleteSpecBranch('nonexistent')

      expect(mockExecFile).toHaveBeenCalledTimes(1) // only hasSpecBranch
    })
  })

  describe('init', () => {
    it('returns false when no token', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(execSync).mockReturnValue(Buffer.from(''))

      const gh = new M2mGitHub(null, '/tmp/public')
      const result = await gh.init()

      expect(result).toBe(false)
    })

    it('authenticates and finds fork when token present', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(execSync).mockReturnValue(Buffer.from(''))

      mockExecFile
        .mockResolvedValueOnce({ stdout: 'testuser\n', stderr: '' }) // gh api user
        .mockResolvedValueOnce({ stdout: '{"name":"modbus2mqtt.config"}', stderr: '' }) // repo view (fork exists)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // sync fork

      const gh = new M2mGitHub('test-token', '/tmp/public')
      const result = await gh.init()

      expect(result).toBe(true)
    })
  })

  describe('getPullRequest', () => {
    it('returns PR status info', async () => {
      const prInfo = { merged: true, closed_at: '2024-01-01', html_url: 'https://github.com/...' }
      mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(prInfo), stderr: '' })

      const gh = new M2mGitHub('test-token', '/tmp/public')
      const result = await gh.getPullRequest(42)

      expect(result.merged).toBe(true)
      expect(result.closed_at).toBe('2024-01-01')
    })

    it('throws when no token', async () => {
      const gh = new M2mGitHub(null, '/tmp/public')
      await expect(gh.getPullRequest(42)).rejects.toThrow('No Github token configured')
    })
  })

  describe('createPullrequest', () => {
    it('creates issue and PR', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: '123\n', stderr: '' }) // create issue
        .mockResolvedValueOnce({ stdout: '456\n', stderr: '' }) // create PR

      const gh = new M2mGitHub('test-token', '/tmp/public')
      gh['ownOwner'] = 'testuser'
      const prNumber = await gh.createPullrequest('Title', 'Content', 'test-branch')

      expect(prNumber).toBe(456)
      expect(mockExecFile).toHaveBeenCalledTimes(2)
    })

    it('throws when no token', async () => {
      const gh = new M2mGitHub(null, '/tmp/public')
      await expect(gh.createPullrequest('T', 'C', 'b')).rejects.toThrow('No Github token configured')
    })
  })

  describe('deleteRepository', () => {
    it('calls gh repo delete', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' })

      const gh = new M2mGitHub('test-token', '/tmp/public')
      gh['ownOwner'] = 'testuser'
      await gh.deleteRepository()

      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        ['repo', 'delete', 'testuser/modbus2mqtt.config', '--yes'],
        expect.anything()
      )
    })

    it('throws when no token', async () => {
      const gh = new M2mGitHub(null, '/tmp/public')
      await expect(gh.deleteRepository()).rejects.toThrow('No Github token configured')
    })
  })

  describe('commitFiles', () => {
    it('clones, creates branch, copies files, commits, and pushes', async () => {
      const gh = new M2mGitHub('test-token', '/tmp/public')
      gh['ownOwner'] = 'testuser'

      // Bypass polling - directly resolve waitForOwnModbus2MqttRepo
      vi.spyOn(gh as any, 'waitForOwnModbus2MqttRepo').mockResolvedValue(undefined)

      mockExecFile
        // hasSpecBranch - 404 means branch doesn't exist
        .mockRejectedValueOnce(new Error('Not Found'))
        // git clone
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // git checkout -b
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // git add
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // git commit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // git rev-parse HEAD
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        // git push
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      vi.mocked(fs.existsSync).mockReturnValue(true)

      const sha = await gh.commitFiles('/source', 'test-branch', ['specifications/test.json'], 'Title', 'Message')

      expect(sha).toBe('abc123')
      expect(fs.copyFileSync).toHaveBeenCalled()
      expect(fs.rmSync).toHaveBeenCalled()
    })

    it('throws when branch already exists', async () => {
      const gh = new M2mGitHub('test-token', '/tmp/public')
      gh['ownOwner'] = 'testuser'

      vi.spyOn(gh as any, 'waitForOwnModbus2MqttRepo').mockResolvedValue(undefined)

      // hasSpecBranch - branch exists
      mockExecFile.mockResolvedValueOnce({ stdout: 'refs/heads/test-branch', stderr: '' })

      await expect(
        gh.commitFiles('/source', 'test-branch', ['specifications/test.json'], 'Title', 'Message')
      ).rejects.toThrow('already a branch named test-branch')
    })
  })
})
