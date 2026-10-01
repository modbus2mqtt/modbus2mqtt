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
    const src: string = fs.readFileSync(yamlFile, { encoding: 'utf8' })
    let parsed = parse(src)
    if (fs.existsSync(secretsFile)) {
      const secrets = parse(fs.readFileSync(secretsFile, { encoding: 'utf8' })) ?? {}
      // Substitute !secret placeholders AFTER parsing. The old approach edited
      // the raw YAML text and wrapped values in literal quotes, which corrupted
      // the secret on every write cycle (''!secret x'' -> '"value"' -> parse ->
      // value with embedded quotes -> written back quoted -> next read produced
      // invalid YAML). Post-parse substitution keeps the actual value intact.
      const secretRe = /^!secret ([a-zA-Z0-9-_]+)$/
      const resolveSecrets = (node: unknown): unknown => {
        if (node == null) return node
        if (typeof node === 'string') {
          const m = node.match(secretRe)
          if (!m) return node
          const key = m[1]
          if (secrets[key] !== undefined && secrets[key] !== null && String(secrets[key]).length > 0) {
            return String(secrets[key])
          }
          debug('no usable entry in secrets file for ' + key + ' field will be ignored')
          return undefined
        }
        if (Array.isArray(node)) {
          const out: unknown[] = []
          for (const item of node) {
            const resolved = resolveSecrets(item)
            if (resolved !== undefined) out.push(resolved)
          }
          return out
        }
        if (typeof node === 'object') {
          const out: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            const resolved = resolveSecrets(v)
            if (resolved !== undefined) out[k] = resolved
          }
          return out
        }
        return node
      }
      parsed = resolveSecrets(parsed)
    }

    return parsed as Iconfiguration
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
   * Returns paths relative to the browsed root using forward slashes
   * (e.g. "mtls/client.pem"), so certificates stored in subdirectories can be
   * selected in the UI.
   *
   * When the ssl directory is missing or empty (the addon/deployment does not
   * mount any certificates there), the browser falls back to the config
   * directory, which always contains files (modbus2mqtt.yaml, busses/,
   * specifications/...). Without this fallback the picker would show a
   * misleading "no server files available" even though the container clearly
   * has a populated filesystem — the root returned tells the UI which
   * directory was actually browsed.
   */
  listSslFiles(): { files: string[]; root: string } {
    const candidates = [ConfigPersistence.sslDir, ConfigPersistence.getLocalDir(), ConfigPersistence.configDir]
      .filter((d): d is string => !!d && d.length > 0)
    for (const root of candidates) {
      const files = this.walkFiles(root)
      if (files.length > 0) return { files, root }
    }
    // Nothing browsable at all — return the sslDir (even if missing) so the UI
    // can at least show which path is being looked at.
    return { files: [], root: ConfigPersistence.sslDir || process.cwd() }
  }

  /** Walk `root` and collect all regular files (following symlinks safely). */
  private walkFiles(root: string): string[] {
    const result: string[] = []
    // Track visited real paths so symlink cycles (dir -> parent) cannot loop forever.
    const visited = new Set<string>()
    const walk = (dir: string) => {
      let realDir: string
      try {
        realDir = fs.realpathSync(dir)
      } catch {
        return // unreadable/missing dir
      }
      if (visited.has(realDir)) return
      visited.add(realDir)
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return // permission error etc — skip
      }
      for (const entry of entries) {
        const full = join(dir, entry.name)
        // Follow symlinks: Home Assistant's /ssl often mounts certificate
        // stores as symlinks, and Dirent.isFile() is false for them.
        let isDir = entry.isDirectory()
        let isFile = entry.isFile()
        if (entry.isSymbolicLink()) {
          try {
            const st = fs.statSync(full) // follows the link
            isDir = st.isDirectory()
            isFile = st.isFile()
          } catch {
            continue // dangling symlink
          }
        }
        if (isDir) walk(full)
        else if (isFile) result.push(path.relative(root, full).split(path.sep).join('/'))
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
