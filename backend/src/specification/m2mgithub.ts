import { LogLevelEnum, Logger } from './log.js'
import { execFile as execFileCb, execSync } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'
import { Subject, first } from 'rxjs'
import * as fs from 'fs'
import { ConfigSpecification } from './configspec.js'
import { tmpdir } from 'os'

import Debug from 'debug'
const debug = Debug('m2mgithub')
const execFile = promisify(execFileCb)

export const githubPublicNames = {
  publicModbus2mqttOwner: 'modbus2mqtt',
  modbus2mqttRepo: 'modbus2mqtt.config',
  modbus2mqttBranch: 'main',
}

const log = new Logger('m2mGithub')

interface IPullRequestStatusInfo {
  merged: boolean
  closed_at: string | null
  html_url: string
}

export class M2mGitHub {
  private ownOwner: string | undefined
  private token: string | null
  private static forking: boolean = false
  private isRunning = false
  private waitFinished: Subject<void> = new Subject<void>()

  constructor(
    personalAccessToken: string | null,
    private publicRoot: string
  ) {
    this.token = personalAccessToken
  }

  private ghEnv(): { env: NodeJS.ProcessEnv } | undefined {
    if (this.token) return { env: { ...process.env, GITHUB_TOKEN: this.token } }
    return undefined
  }

  private async execGh(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const opts = { ...this.ghEnv(), encoding: 'utf-8' as const }
    return execFile('gh', args, opts)
  }

  private async execGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    return execFile('git', args, { cwd, encoding: 'utf-8' as const })
  }

  private gitCloneUrl(owner: string, repo: string): string {
    if (this.token) {
      return `https://x-access-token:${this.token}@github.com/${owner}/${repo}.git`
    }
    return `https://github.com/${owner}/${repo}.git`
  }

  private async findOrCreateOwnModbus2MqttRepo(): Promise<void> {
    debug('findOrCreateOwnModbus2MqttRepo')
    if (!this.ownOwner || !this.token) return
    try {
      await this.execGh(['repo', 'view', `${this.ownOwner}/${githubPublicNames.modbus2mqttRepo}`, '--json', 'name'])
      M2mGitHub.forking = false
      // Fork exists, sync it
      await this.syncFork()
    } catch {
      // Fork doesn't exist, create it
      if (!M2mGitHub.forking) {
        await this.createOwnModbus2MqttRepo()
      }
    }
  }

  private async syncFork(): Promise<void> {
    debug('syncFork')
    try {
      await this.execGh([
        'api',
        '-X',
        'POST',
        `repos/${this.ownOwner}/${githubPublicNames.modbus2mqttRepo}/merge-upstream`,
        '-f',
        `branch=${githubPublicNames.modbus2mqttBranch}`,
      ])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('422')) {
        throw new Error(msg + '\n Permission denied for the github token. Please sync Repository in github.com.')
      }
      throw e
    }
  }

  async hasSpecBranch(branch: string): Promise<boolean> {
    if (!this.token) throw new Error('No Github token configured')
    try {
      const { stdout } = await this.execGh([
        'api',
        `repos/${this.ownOwner}/${githubPublicNames.modbus2mqttRepo}/git/ref/heads/${branch}`,
        '--jq',
        '.ref',
      ])
      return stdout.trim().length > 0
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('404') || msg.includes('Not Found')) return false
      throw e
    }
  }

  async deleteSpecBranch(branch: string): Promise<void> {
    if (!this.token) throw new Error('No Github token configured')
    const hasBranch = await this.hasSpecBranch(branch)
    if (hasBranch) {
      await this.execGh([
        'api',
        '-X',
        'DELETE',
        `repos/${this.ownOwner}/${githubPublicNames.modbus2mqttRepo}/git/refs/heads/${branch}`,
      ])
    }
  }

  private async createOwnModbus2MqttRepo(): Promise<void> {
    debug('createOwnModbus2MqttRepo')
    M2mGitHub.forking = true
    try {
      if (githubPublicNames.publicModbus2mqttOwner) {
        await this.execGh([
          'repo',
          'fork',
          `${githubPublicNames.publicModbus2mqttOwner}/${githubPublicNames.modbus2mqttRepo}`,
          '--clone=false',
          '--default-branch-only',
        ])
      }
    } catch (e) {
      M2mGitHub.forking = false
      throw e
    }
  }

  private async checkRepo(): Promise<boolean> {
    if (!this.token) throw new Error('No Github token configured')
    if (!this.ownOwner) return false
    try {
      await this.execGh(['repo', 'view', `${this.ownOwner}/${githubPublicNames.modbus2mqttRepo}`, '--json', 'name'])
    } catch {
      return false
    }
    debug('checkRepo: sync fork')
    M2mGitHub.forking = false
    await this.syncFork()
    return true
  }

  private waitForOwnModbus2MqttRepo(): Promise<void> {
    if (this.isRunning) {
      return new Promise<void>((resolve) => {
        this.waitFinished.pipe(first()).subscribe(() => {
          resolve()
        })
      })
    } else {
      return new Promise<void>((resolve, reject) => {
        if (!this.token) reject(new Error('No Github token configured'))
        else {
          let count = 0
          const interval = setInterval(() => {
            debug('inInterval')
            if (!this.isRunning && (count > 30 ? Math.floor(count % 60) == 0 : true)) {
              this.isRunning = true
              this.checkRepo()
                .then((available) => {
                  if (available) {
                    this.isRunning = false
                    this.waitFinished.next()
                    clearInterval(interval)
                    resolve()
                  }
                })
                .catch((e: unknown) => {
                  this.isRunning = false
                  const msg = e instanceof Error ? e.message : String(e)
                  log.log(
                    LogLevelEnum.error,
                    'Validate Repository ' +
                      this.ownOwner +
                      '/' +
                      githubPublicNames.publicModbus2mqttOwner +
                      ' failed. message: ' +
                      msg
                  )
                  reject(e)
                })
            }
            count++
          }, 1000)
        }
      })
    }
  }

  private clonePublicFiles(): void {
    log.log(
      LogLevelEnum.info,
      execSync(
        'git clone https://github.com/' +
          githubPublicNames.publicModbus2mqttOwner +
          '/' +
          githubPublicNames.modbus2mqttRepo +
          '.git ' +
          this.publicRoot
      ).toString()
    )
  }

  fetchPublicFiles(): void {
    debug('Fetch public files')
    if (existsSync(this.publicRoot)) {
      if (existsSync(join(this.publicRoot, '.git'))) {
        try {
          const msg = execSync('git pull', { cwd: this.publicRoot }).toString()
          if (msg.split(/\r\n|\r|\n/).length > 2) log.log(LogLevelEnum.info, msg)
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          log.log(LogLevelEnum.warn, 'git pull failed: ' + msg)
        }
      } else if (fs.readdirSync(this.publicRoot).length == 0) {
        // Empty directory (e.g. pre-created by the s6 init script so the addon can
        // run non-root). git can clone into an existing empty directory, so do that
        // instead of skipping the sync.
        this.clonePublicFiles()
      } else {
        // Directory has content but no .git repo (test fixtures or manual setup):
        // leave it untouched to avoid network access during tests.
        log.log(LogLevelEnum.info, 'Public files directory exists with content, skipping git clone')
      }
    } else {
      this.clonePublicFiles()
    }
    new ConfigSpecification().readYaml()
  }

  static getPullRequestUrl(pullNumber: number): string {
    return `https://github.com/${githubPublicNames.publicModbus2mqttOwner}/${githubPublicNames.modbus2mqttRepo}/pull/${pullNumber}`
  }

  async createPullrequest(title: string, content: string, branchName: string): Promise<number> {
    if (!this.token) throw new Error('No Github token configured')
    let issueNumber: number
    try {
      const { stdout } = await this.execGh([
        'api',
        `repos/${githubPublicNames.publicModbus2mqttOwner}/${githubPublicNames.modbus2mqttRepo}/issues`,
        '-X',
        'POST',
        '-f',
        `title=${title}`,
        '-f',
        `body=${content}`,
        '-f',
        'labels[]=automerge',
        '--jq',
        '.number',
      ])
      issueNumber = parseInt(stdout.trim())
    } catch (e: unknown) {
      const err = new Error(e instanceof Error ? e.message : String(e)) as Error & { step?: string }
      err.step = 'create issue'
      throw err
    }
    try {
      const { stdout } = await this.execGh([
        'api',
        `repos/${githubPublicNames.publicModbus2mqttOwner}/${githubPublicNames.modbus2mqttRepo}/pulls`,
        '-X',
        'POST',
        '-f',
        `title=${title}`,
        '-f',
        `body=${content}\nCloses #${issueNumber}`,
        '-f',
        `head=${this.ownOwner}:${branchName}`,
        '-f',
        `base=${githubPublicNames.modbus2mqttBranch}`,
        '--jq',
        '.number',
      ])
      return parseInt(stdout.trim())
    } catch (e: unknown) {
      const err = new Error(e instanceof Error ? e.message : String(e)) as Error & { step?: string }
      err.step = 'create pull'
      throw err
    }
  }

  async getPullRequest(pullNumber: number): Promise<IPullRequestStatusInfo> {
    if (!this.token) throw new Error('No Github token configured')
    try {
      const { stdout } = await this.execGh([
        'api',
        `repos/${githubPublicNames.publicModbus2mqttOwner}/${githubPublicNames.modbus2mqttRepo}/pulls/${pullNumber}`,
        '--jq',
        '{merged: .merged, closed_at: .closed_at, html_url: .html_url}',
      ])
      return JSON.parse(stdout)
    } catch (e: unknown) {
      debug(JSON.stringify(e))
      throw e
    }
  }

  getInfoFromError(e: unknown) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e)
    return 'ERROR: ' + msg
  }

  async commitFiles(root: string, branchName: string, files: string[], title: string, message: string): Promise<string> {
    try {
      await this.waitForOwnModbus2MqttRepo()
    } catch (e: unknown) {
      const err = new Error(e instanceof Error ? e.message : String(e)) as Error & { step?: string }
      err.step = 'waitForOwnModbus2MqttRepo'
      throw err
    }

    const hasBranch = await this.hasSpecBranch(branchName)
    if (hasBranch) {
      throw new Error(
        'There is already a branch named ' +
          branchName +
          ' Please delete it in your github repository ' +
          this.ownOwner +
          '/' +
          githubPublicNames.modbus2mqttRepo +
          ' at github.com'
      )
    }

    debug('start committing via git')
    const tmpDir = fs.mkdtempSync(join(tmpdir(), 'm2m-commit-'))
    try {
      // Clone the fork
      const cloneUrl = this.gitCloneUrl(this.ownOwner!, githubPublicNames.modbus2mqttRepo)
      await this.execGit(['clone', '--depth', '1', cloneUrl, tmpDir])

      // Create branch
      await this.execGit(['checkout', '-b', branchName], tmpDir)

      // Copy files from source to clone
      for (const file of files) {
        const srcPath = join(root, file)
        if (!fs.existsSync(srcPath)) {
          if (file.indexOf('/files/') !== -1 && !file.endsWith('files.yaml')) {
            debug('File not found: ' + srcPath)
            continue
          }
          throw new Error('File not found ' + srcPath)
        }
        const destPath = join(tmpDir, file)
        const destDir = join(tmpDir, file, '..')
        fs.mkdirSync(destDir, { recursive: true })
        fs.copyFileSync(srcPath, destPath)
      }

      // Stage, commit, push
      await this.execGit(['add', '.'], tmpDir)
      await this.execGit(['commit', '-m', `${title}\n${message}`], tmpDir)
      const { stdout } = await this.execGit(['rev-parse', 'HEAD'], tmpDir)
      await this.execGit(['push', 'origin', branchName], tmpDir)

      debug('updated')
      return stdout.trim()
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }

  async init(): Promise<boolean> {
    debug('init')
    this.fetchPublicFiles()
    if (!this.token) return false
    if (!this.ownOwner) {
      try {
        const { stdout } = await this.execGh(['api', 'user', '--jq', '.login'])
        this.ownOwner = stdout.trim()
      } catch (e: unknown) {
        log.log(LogLevelEnum.error, 'GitHub authentication failed: ' + (e instanceof Error ? e.message : String(e)))
        return false
      }
    }
    try {
      await this.findOrCreateOwnModbus2MqttRepo()
      return true
    } catch (e: unknown) {
      this.ownOwner = undefined
      throw e
    }
  }

  async deleteRepository(): Promise<void> {
    if (!this.token) throw new Error('No Github token configured')
    if (this.ownOwner) {
      await this.execGh(['repo', 'delete', `${this.ownOwner}/${githubPublicNames.modbus2mqttRepo}`, '--yes'])
    }
  }
}
