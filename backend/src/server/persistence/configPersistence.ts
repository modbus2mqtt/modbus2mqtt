import { parse, stringify } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import Debug from 'debug'
import AdmZip from 'adm-zip'
import stream from 'stream'
import { HttpErrorsEnum, Iconfiguration, IModbusConnection, Islave } from '../../shared/server/index.js'
import { ISingletonPersistence } from './persistence.js'
import { IfileSpecification, Logger, LogLevelEnum } from '../../specification/index.js'
import { SpecPersistence } from '../../specification/specPersistence.js'
import { BusPersistence } from './busPersistence.js'

const debug = Debug('configPersistence')
const log = new Logger('configPersistence')
const secretsLength = 256

export class ConfigPersistence implements ISingletonPersistence<Iconfiguration> {
  static configDir: string = ''
  static sslDir: string = ''
  static dataDir: string = ''

  static getLocalDir(): string {
    return join(ConfigPersistence.configDir, 'modbus2mqtt')
  }

  constructor() {}

  async read(): Promise<Iconfiguration | undefined> {
    if (!ConfigPersistence.configDir || ConfigPersistence.configDir.length === 0) {
      return undefined
    }
    if (!fs.existsSync(ConfigPersistence.configDir)) {
      return undefined
    }

    if (fs.existsSync(this.getImportMarkerPath())) {
      throw new Error(
        'Local configuration is in an inconsistent state from a partial import. ' +
          'Delete ' +
          ConfigPersistence.getLocalDir() +
          ' and re-import.'
      )
    }

    const yamlFile = this.getConfigPath()
    if (!fs.existsSync(yamlFile)) {
      return undefined
    }

    const secretsFile = join(ConfigPersistence.getLocalDir(), 'secrets.yaml')
    let src: string = fs.readFileSync(yamlFile, { encoding: 'utf8' })
    if (fs.existsSync(secretsFile)) {
      const secrets = parse(fs.readFileSync(secretsFile, { encoding: 'utf8' })) ?? {}
      const srcLines = src.split('\n')
      src = ''
      srcLines.forEach((line) => {
        const r1 = /"*!secret ([a-zA-Z0-9-_]*)"*/g
        const matches = line.matchAll(r1)
        let skipLine = false
        for (const match of matches) {
          const key = match[1]
          if (secrets[key] && secrets[key].length) {
            line = line.replace(match[0], '"' + secrets[key] + '"')
          } else {
            skipLine = true
            if (!secrets[key]) debug('no entry in secrets file for ' + key + ' line will be ignored')
            else debug('secrets file entry contains !secret for ' + key + ' line will be ignored')
          }
        }
        if (!skipLine) src = src.concat(line, '\n')
      })
    }

    return parse(src) as Iconfiguration
  }

  write(config: Iconfiguration): void {
    const cpConfig = structuredClone(config)
    const secrets: {
      mqttpassword?: string
      mqttuser?: string
      githubPersonalToken?: string
    } = {}

    if (cpConfig.mqttconnect.password) {
      secrets.mqttpassword = cpConfig.mqttconnect.password as string
      cpConfig.mqttconnect.password = '!secret mqttpassword'
    }
    if (cpConfig.mqttconnect.username) {
      secrets.mqttuser = cpConfig.mqttconnect.username
      cpConfig.mqttconnect.username = '!secret mqttuser'
    }
    if (cpConfig.githubPersonalToken) {
      secrets.githubPersonalToken = cpConfig.githubPersonalToken
      cpConfig.githubPersonalToken = '!secret githubPersonalToken'
    }

    const nonConfigs: string[] = ['mqttusehassio', 'filelocation', 'appVersion']
    nonConfigs.forEach((name: string) => {
      delete cpConfig[name as keyof Iconfiguration]
    })

    const filename = this.getConfigPath()
    const dir = path.dirname(filename)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    let s = stringify(cpConfig)
    fs.writeFileSync(filename, s, { encoding: 'utf8' })
    s = stringify(secrets)
    fs.writeFileSync(this.getSecretsPath(), s, { encoding: 'utf8' })
  }

  getLocalDir(): string {
    return ConfigPersistence.getLocalDir()
  }

  getConfigPath(): string {
    return join(ConfigPersistence.getLocalDir(), 'modbus2mqtt.yaml')
  }

  getSecretsPath(): string {
    return join(ConfigPersistence.getLocalDir(), 'secrets.yaml')
  }

  static getSecret(pathStr: string): string {
    let result = ''
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const charactersLength = characters.length
    let counter = 0
    if (fs.existsSync(pathStr)) {
      const secret = fs.readFileSync(pathStr, { encoding: 'utf8' }).toString()
      if (secret && secret.length > 0) {
        return secret
      }
    }
    debug('getSecret: Create secrets file at' + pathStr)
    while (counter < secretsLength) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength))
      counter += 1
    }
    const dir = path.dirname(pathStr)
    debug('Config.getSecret: write Secretfile to ' + pathStr)
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(pathStr, result, { encoding: 'utf8' })
    debug('Config.getSecret: write successful')

    return result
  }

  ensureSecret(): string {
    const effectiveSslDir = ConfigPersistence.sslDir.length > 0 ? ConfigPersistence.sslDir : process.cwd()
    const secretsfile = join(effectiveSslDir, 'secrets.txt')
    const secretsDir = path.dirname(secretsfile)
    if (secretsDir && !fs.existsSync(secretsfile) && !fs.existsSync(secretsDir)) {
      fs.mkdirSync(secretsDir, { recursive: true })
    }
    if (fs.existsSync(secretsfile)) {
      debug('secretsfile ' + secretsfile + ' exists')
      try {
        fs.accessSync(secretsfile, fs.constants.W_OK)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const msg = `Secrets file ${secretsfile} is not writable! (error: ${message})`
        log.log(LogLevelEnum.error, msg)
        throw new Error(msg)
      }
    } else {
      try {
        fs.accessSync(secretsDir, fs.constants.W_OK)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const msg = `Secrets directory ${secretsDir} is not writable! (cwd: ${process.cwd()}, error: ${message})`
        log.log(LogLevelEnum.error, msg)
        throw new Error(msg)
      }
    }
    debug('ensureSecret: secretsfile permissions are OK ' + secretsfile)
    return ConfigPersistence.getSecret(secretsfile)
  }

  readCertificateFile(filename?: string): string | undefined {
    if (filename && ConfigPersistence.sslDir) {
      const fn = join(ConfigPersistence.sslDir, filename)
      // Prevent path traversal: the resolved file must stay inside sslDir
      const base = path.resolve(ConfigPersistence.sslDir)
      const resolved = path.resolve(fn)
      if (resolved !== base && !resolved.startsWith(base + path.sep)) {
        log.log(LogLevelEnum.error, `readCertificateFile: refusing path outside ssl directory: ${filename}`)
        return undefined
      }
      if (fs.existsSync(fn) && fs.statSync(fn).isFile()) return fs.readFileSync(fn, { encoding: 'utf8' }).toString()
    }
    return undefined
  }

  /**
   * Recursively lists all certificate files in the ssl directory.
   * Returns paths relative to sslDir using forward slashes (e.g. "mtls/client.pem"),
   * so certificates stored in subdirectories can be selected in the UI.
   */
  listSslFiles(): string[] {
    if (!ConfigPersistence.sslDir || !ConfigPersistence.sslDir.length) return []
    const root = ConfigPersistence.sslDir
    const result: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.isFile()) result.push(path.relative(root, full).split(path.sep).join('/'))
      }
    }
    walk(root)
    return result
  }

  getImportMarkerPath(): string {
    return join(ConfigPersistence.getLocalDir(), '.import-in-progress')
  }

  hasLocalUserContent(): boolean {
    const localDir = ConfigPersistence.getLocalDir()
    if (!fs.existsSync(localDir)) return false
    if (fs.existsSync(this.getConfigPath())) return true
    const busDir = join(localDir, 'busses')
    if (fs.existsSync(busDir) && fs.readdirSync(busDir).length > 0) return true
    const specDir = join(localDir, 'specifications')
    if (fs.existsSync(specDir)) {
      const specEntries = fs.readdirSync(specDir).filter((f) => f !== 'files')
      if (specEntries.length > 0) return true
      const filesDir = join(specDir, 'files')
      if (fs.existsSync(filesDir) && fs.readdirSync(filesDir).length > 0) return true
    }
    return false
  }

  async importLocalZip(zip: Buffer): Promise<{ ok: boolean; status: HttpErrorsEnum; message: string }> {
    if (this.hasLocalUserContent()) {
      return { ok: false, status: HttpErrorsEnum.ErrConflict, message: 'local directory not empty' }
    }

    let archive: AdmZip
    try {
      archive = new AdmZip(zip)
    } catch (e) {
      return { ok: false, status: HttpErrorsEnum.ErrBadRequest, message: 'Invalid ZIP: ' + (e as Error).message }
    }
    const entries = archive.getEntries()
    if (entries.length === 0) {
      return { ok: false, status: HttpErrorsEnum.ErrBadRequest, message: 'ZIP is empty' }
    }

    const localDir = ConfigPersistence.getLocalDir()
    for (const entry of entries) {
      if (entry.isDirectory) continue
      const name = entry.entryName
      const norm = path.normalize(name)
      if (path.isAbsolute(name) || name.startsWith('/') || norm.startsWith('..') || norm.includes('..' + path.sep)) {
        return { ok: false, status: HttpErrorsEnum.ErrBadRequest, message: 'Invalid ZIP entry path: ' + name }
      }
    }

    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true })
    const markerPath = this.getImportMarkerPath()
    fs.writeFileSync(markerPath, '', { encoding: 'utf8' })

    try {
      const busPersistence = new BusPersistence(localDir)
      const specPersistence = new SpecPersistence(ConfigPersistence.configDir, ConfigPersistence.dataDir)

      for (const entry of entries) {
        if (entry.isDirectory) continue
        const name = entry.entryName
        const base = path.basename(name)

        if (base === 'secrets.yaml') {
          debug('Skipping secrets.yaml in ZIP')
          continue
        }

        if (name === 'modbus2mqtt.yaml') {
          const targetFile = this.getConfigPath()
          if (!fs.existsSync(path.dirname(targetFile))) {
            fs.mkdirSync(path.dirname(targetFile), { recursive: true })
          }
          fs.writeFileSync(targetFile, entry.getData(), { flag: 'w' })
          continue
        }

        const busMatch = /^busses\/bus\.(\d+)\/(.+)$/.exec(name)
        if (busMatch) {
          const busId = parseInt(busMatch[1], 10)
          const fileInBus = busMatch[2]
          if (fileInBus.includes('/')) {
            log.log(LogLevelEnum.warn, 'Skipping unexpected nested bus entry: ' + name)
            continue
          }
          const yamlContent = entry.getData().toString('utf8')
          const parsed = parse(yamlContent)
          if (fileInBus === 'bus.yaml') {
            busPersistence.writeBus(busId, parsed as IModbusConnection)
          } else if (fileInBus.startsWith('s') && fileInBus.endsWith('.yaml')) {
            busPersistence.writeSlave(busId, parsed as Islave)
          } else {
            log.log(LogLevelEnum.warn, 'Skipping unknown bus file: ' + name)
          }
          continue
        }

        if (name.startsWith('specifications/files/')) {
          const target = join(localDir, name)
          const targetDir = path.dirname(target)
          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
          fs.writeFileSync(target, entry.getData())
          continue
        }

        const specJsonMatch = /^specifications\/([^/]+)\.json$/.exec(name)
        if (specJsonMatch) {
          const filename = specJsonMatch[1]
          const jsonContent = entry.getData().toString('utf8')
          const spec = JSON.parse(jsonContent) as IfileSpecification
          spec.filename = filename
          specPersistence.writeItem(filename, spec)
          continue
        }

        const specYamlMatch = /^specifications\/([^/]+)\.yaml$/.exec(name)
        if (specYamlMatch) {
          // Legacy YAML spec — copy raw; Migrator will upgrade to JSON on next read.
          const target = join(localDir, name)
          const targetDir = path.dirname(target)
          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
          fs.writeFileSync(target, entry.getData())
          continue
        }

        log.log(LogLevelEnum.warn, 'Skipping unexpected ZIP entry: ' + name)
      }

      const secretsPath = this.getSecretsPath()
      if (!fs.existsSync(secretsPath)) {
        fs.writeFileSync(secretsPath, '{}\n', { encoding: 'utf8' })
      }

      fs.unlinkSync(markerPath)
      return { ok: true, status: HttpErrorsEnum.OK, message: 'imported' }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.log(LogLevelEnum.error, 'Import failed: ' + msg)
      return { ok: false, status: HttpErrorsEnum.SrvErrInternalServerError, message: 'Import failed: ' + msg }
    }
  }

  async createLocalExportZip(writable: stream.Writable): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const archive = new AdmZip()
        const dir = ConfigPersistence.getLocalDir()
        const files: string[] = fs.readdirSync(dir, { recursive: true }) as string[]
        files.forEach((file) => {
          const p = join(dir, file)
          if (fs.statSync(p).isFile() && file.indexOf('secrets.yaml') < 0) {
            archive.addLocalFile(p, path.dirname(file))
          }
        })
        writable.write(archive.toBuffer())
        writable.end(() => {
          resolve()
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  resetForE2E(minimalConfig: Record<string, unknown>): void {
    if (!fs.existsSync(ConfigPersistence.getLocalDir())) fs.mkdirSync(ConfigPersistence.getLocalDir(), { recursive: true })
    fs.writeFileSync(this.getConfigPath(), stringify(minimalConfig), { encoding: 'utf8' })

    const secretsPath = this.getSecretsPath()
    if (fs.existsSync(secretsPath)) fs.unlinkSync(secretsPath)
  }
}
