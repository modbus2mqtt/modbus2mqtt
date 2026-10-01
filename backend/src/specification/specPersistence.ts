import { parse, stringify } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import {
  Converters,
  EnumNumberFormat,
  FileLocation,
  Inumber,
  SPECIFICATION_VERSION,
  SpecificationStatus,
  getBaseFilename,
} from '../shared/specification/index.js'
import { IfileSpecification } from './ifilespecification.js'
import { IimageAndDocumentFilesType, Migrator } from './migrator.js'
import { M2mGitHub } from './m2mgithub.js'
import { ICollectionPersistence } from '../server/persistence/persistence.js'
import { LogLevelEnum, Logger } from './log.js'

const log = new Logger('specPersistence')
const filesUrlPrefix = 'specifications/files'

function getSpecificationImageOrDocumentUrl(rootUrl: string | undefined, specName: string, url: string): string {
  const fn = getBaseFilename(url)
  let rc: string = ''
  if (rootUrl && rootUrl.length > 0) {
    let append = '/'
    if (rootUrl.endsWith('/')) append = ''
    rc = rootUrl + append + join(filesUrlPrefix, specName, fn)
  } else rc = join(filesUrlPrefix, specName, fn)
  return rc
}

export class SpecPersistence implements ICollectionPersistence<IfileSpecification> {
  constructor(
    private configDir: string,
    private dataDir: string
  ) {}

  private getPublicDir(): string {
    return join(this.dataDir, 'public')
  }

  private getLocalDir(): string {
    return join(this.configDir, 'modbus2mqtt')
  }

  private getPublicSpecDir(): string {
    return join(this.getPublicDir(), 'specifications')
  }

  private getLocalSpecDir(): string {
    return join(this.getLocalDir(), 'specifications')
  }

  private getLocalJsonPath(filename: string): string {
    return join(this.getLocalSpecDir(), filename + '.json')
  }

  private getLocalYamlPath(filename: string): string {
    return join(this.getLocalSpecDir(), filename + '.yaml')
  }

  private getPublicYamlPath(filename: string): string {
    return join(this.getPublicSpecDir(), filename + '.yaml')
  }

  private getLocalFilesPath(specfilename: string): string {
    return join(this.getLocalDir(), getSpecificationImageOrDocumentUrl('', specfilename, ''))
  }

  private getPublicFilesPath(specfilename: string): string {
    return join(this.getPublicDir(), getSpecificationImageOrDocumentUrl('', specfilename, ''))
  }

  readAll(): IfileSpecification[] {
    // Read published specs
    const publishedSpecs = this.readFromDirectory(this.getPublicSpecDir())
    publishedSpecs.forEach((spec) => {
      spec.status = SpecificationStatus.published
    })

    // Read local specs (with publicNames for status derivation in YAML migration)
    const publicNames = new Set(publishedSpecs.map((s) => s.filename))
    const localSpecs = this.readFromDirectory(this.getLocalSpecDir(), publicNames)

    return [...localSpecs, ...publishedSpecs]
  }

  readPublished(): IfileSpecification[] {
    const specs = this.readFromDirectory(this.getPublicSpecDir())
    specs.forEach((spec) => {
      spec.status = SpecificationStatus.published
    })
    return specs
  }

  readLocal(publicNames?: Set<string>): IfileSpecification[] {
    return this.readFromDirectory(this.getLocalSpecDir(), publicNames)
  }

  private readFromDirectory(directory: string, publicNames?: Set<string>): IfileSpecification[] {
    const rc: IfileSpecification[] = []
    if (!fs.existsSync(directory)) {
      return rc
    }
    const allFiles: string[] = fs.readdirSync(directory)
    const jsonNames = new Set(allFiles.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')))

    allFiles.forEach((file: string) => {
      try {
        if (file.endsWith('.json')) {
          const src = fs.readFileSync(join(directory, file), { encoding: 'utf8' })
          const o: IfileSpecification = JSON.parse(src)
          o.filename = file.replace('.json', '')
          if (publicNames && o.status !== SpecificationStatus.contributed) {
            o.status = publicNames.has(o.filename) ? SpecificationStatus.cloned : SpecificationStatus.added
          }
          this.postProcessSpec(o)
          rc.push(o)
        } else if (file.endsWith('.yaml')) {
          const basename = file.replace('.yaml', '')
          if (jsonNames.has(basename)) return // JSON takes precedence

          const src: string = fs.readFileSync(join(directory, file), { encoding: 'utf8' })
          let o: IfileSpecification = parse(src)
          o.filename = basename
          if (o.version != SPECIFICATION_VERSION) {
            o = new Migrator().migrate(o, directory, publicNames)
          } else {
            this.readFilesYaml(directory, o)
            if (publicNames && o.status !== SpecificationStatus.contributed) {
              o.status = publicNames.has(basename) ? SpecificationStatus.cloned : SpecificationStatus.added
            }
          }
          this.postProcessSpec(o)
          rc.push(o)
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        log.log(LogLevelEnum.error, 'Unable to load spec ' + file + ' continuing ' + msg)
      }
    })
    return rc
  }

  private readFilesYaml(directory: string, spec: IfileSpecification) {
    const fp = join(directory, 'files', spec.filename, 'files.yaml')
    if (fs.existsSync(fp)) {
      const src = fs.readFileSync(fp, { encoding: 'utf8' })
      let f: IimageAndDocumentFilesType = parse(src)
      f = new Migrator().migrateFiles(f)
      spec.files = f.files
    } else {
      spec.files = []
    }
    spec.files.forEach((file) => {
      if (file.fileLocation == FileLocation.Local) {
        const url = getSpecificationImageOrDocumentUrl(undefined, spec.filename, file.url)
        file.url = url
      }
    })
  }

  private postProcessSpec(o: IfileSpecification) {
    if (o.entities)
      o.entities.forEach((entity) => {
        // Normalize the converter reference. Spec files written/edited by hand (and the newer
        // 0.5 templates) may carry the object form `converter: { name: 'number' }` while the
        // runtime (ConverterMap.getConverter) expects the plain string `converter: 'number'`.
        // Older specs are normalized by the migrator (0.3->0.4), but specs already at the current
        // version skip migration, so do it here for every loaded spec.
        if (entity.converter != undefined && typeof entity.converter === 'object' && 'name' in entity.converter) {
          entity.converter = (entity.converter as { name: Converters }).name
        }
        if (entity.converter != undefined) {
          const inumber = entity.converterParameters as Inumber
          if (inumber.multiplier != undefined && inumber.numberFormat == undefined) {
            inumber.numberFormat = EnumNumberFormat.default
          }
        }
        if (!o.nextEntityId || entity.id > o.nextEntityId + 1) o.nextEntityId = entity.id + 1
      })
    if (o.pullNumber) o.pullUrl = M2mGitHub.getPullRequestUrl(o.pullNumber)
    if (!o.i18n) o.i18n = []
    if (!o.files) o.files = []
  }

  writeItem(key: string, item: IfileSpecification): void {
    this.writeSpecAsJson(this.getLocalJsonPath(key), item)
    this.writeFilesFromSpec(key, item)
    Migrator.cleanOldFiles(key, this.getLocalSpecDir())
  }

  /**
   * Persists local file payloads (base64 `data`) as real binary files plus the
   * files.yaml sidecar, so static serving (/specifications/files/...), the
   * specification summary list and the contribution/commit path all see the
   * uploaded image/datasheet without relying on the base64 embedded in the
   * spec JSON alone.
   *
   * The webui editor submits the full form (?filedata=true): every local file
   * carries `data` (base64) and its stable `url` (specifications/files/<name>/<base>).
   * Files without `data` are kept as-is (remote URLs / already-on-disk refs).
   */
  private writeFilesFromSpec(key: string, spec: IfileSpecification): void {
    const files = (spec.files || []).filter((f) => f.fileLocation == FileLocation.Local && f.url && f.data)
    if (!files.length) return
    const specDir = this.getLocalFilesPath(key.replace(/\.yaml$/, ''))
    if (!fs.existsSync(specDir)) fs.mkdirSync(specDir, { recursive: true })

    // Write each base64 payload under its final basename; the url already
    // carries the canonical specifications/files/<name>/<base> prefix.
    files.forEach((f) => {
      const base = getBaseFilename(f.url)
      if (!base) return
      const target = join(specDir, base)
      try {
        const buf = Buffer.from(f.data as string, 'base64')
        fs.writeFileSync(target, buf)
      } catch (e) {
        log.log(LogLevelEnum.error, 'Unable to write spec file ' + target + ': ' + (e as Error).message)
      }
    })

    // files.yaml sidecar (legacy format read back by readFilesYaml / migrator
    // 0.4->0.5). Only local entries are listed; the YAML keeps url/fileLocation/
    // usage + the optional lang for documents.
    const yamlEntries = (spec.files || []).filter((f) => f.fileLocation == FileLocation.Local)
    if (!yamlEntries.length) return
    const sidecar = {
      version: '0.1',
      files: yamlEntries.map((f) => {
        const rc: Record<string, unknown> = {
          url: f.url,
          fileLocation: f.fileLocation,
          usage: f.usage,
        }
        if (f.lang) rc.lang = f.lang
        return rc
      }),
    }
    try {
      fs.writeFileSync(join(specDir, 'files.yaml'), stringify(sidecar), { encoding: 'utf8' })
    } catch (e) {
      log.log(LogLevelEnum.error, 'Unable to write files.yaml for ' + key + ': ' + (e as Error).message)
    }
  }

  writeSpecAsJson(filepath: string, spec: IfileSpecification): void {
    const dir = path.dirname(filepath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const ns = structuredClone(spec)
    this.cleanSpecForWriting(ns)
    ns.version = SPECIFICATION_VERSION
    fs.writeFileSync(filepath, JSON.stringify(ns, null, 2), { encoding: 'utf8' })
  }

  deleteItem(key: string): void {
    const jsonPath = this.getLocalJsonPath(key)
    const yamlPath = this.getLocalYamlPath(key)
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath)
    if (fs.existsSync(yamlPath)) fs.unlinkSync(yamlPath)
    const filesPath = this.getLocalFilesPath(key)
    if (fs.existsSync(filesPath)) fs.rmSync(filesPath, { recursive: true })
  }

  deleteLocalSpec(filename: string): void {
    const jsonPath = this.getLocalJsonPath(filename)
    const yamlPath = this.getLocalYamlPath(filename)
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath)
    if (fs.existsSync(yamlPath)) fs.unlinkSync(yamlPath)
    const filesPath = this.getLocalFilesPath(filename)
    if (fs.existsSync(filesPath)) fs.rmSync(filesPath, { recursive: true })
  }

  hasPublicSpec(filename: string): boolean {
    return fs.existsSync(this.getPublicYamlPath(filename)) || fs.existsSync(join(this.getPublicSpecDir(), filename + '.json'))
  }

  /**
   * Renames a spec: deletes old JSON/YAML files and renames the files directory.
   */
  renameSpec(newFilename: string, oldFilename: string): void {
    const oldJsonPath = this.getLocalJsonPath(oldFilename)
    const oldYamlPath = this.getLocalYamlPath(oldFilename)
    if (fs.existsSync(oldJsonPath)) fs.unlinkSync(oldJsonPath)
    if (fs.existsSync(oldYamlPath)) fs.unlinkSync(oldYamlPath)
    this.renameFilesDir(newFilename, oldFilename)
  }

  private renameFilesDir(newFilename: string, oldFilename: string): void {
    const oldPath = getSpecificationImageOrDocumentUrl(this.getLocalDir(), oldFilename, '')
    const newPath = getSpecificationImageOrDocumentUrl(this.getLocalDir(), newFilename, '')
    const newParentDir = path.dirname(newPath)
    if (!fs.existsSync(newParentDir)) fs.mkdirSync(newParentDir, { recursive: true })
    if (fs.existsSync(newPath)) fs.rmSync(newPath, { recursive: true })
    if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath)
  }

  copyPublicFiles(specfilename: string): void {
    const filespath = this.getPublicFilesPath(specfilename)
    const localFilesPath = this.getLocalFilesPath(specfilename)
    if (!fs.existsSync(localFilesPath) && fs.existsSync(filespath)) {
      fs.cpSync(filespath, localFilesPath, { recursive: true })
    }
  }

  private cleanSpecForWriting(spec: IfileSpecification): void {
    spec.entities.forEach((e) => {
      if (!e.icon || e.icon.length == 0) delete e.icon
      if ('identified' in (e as object)) delete (e as { identified?: unknown }).identified
      if ('mqttValue' in (e as object)) delete (e as { mqttValue?: unknown }).mqttValue
      if ('modbusValue' in (e as object)) delete (e as { modbusValue?: unknown }).modbusValue
      if ('commandTopicModbus' in (e as object)) delete (e as { commandTopicModbus?: unknown }).commandTopicModbus
      if ('commandTopic' in (e as object)) delete (e as { commandTopic?: unknown }).commandTopic
      const ce = e as unknown as { converter?: unknown }
      const conv = ce.converter as Record<string, unknown> | null
      if (conv && typeof conv === 'object' && 'registerTypes' in conv) delete (conv as Record<string, unknown>)['registerTypes']
    })
    if (!spec.manufacturer || spec.manufacturer.length == 0) delete spec.manufacturer
    if (!spec.model || spec.model.length == 0) delete spec.model
    if (spec.status != SpecificationStatus.contributed) delete spec.pullNumber
    if ('stateTopic' in (spec as object)) delete (spec as { stateTopic?: unknown }).stateTopic
    if ('statePayload' in (spec as object)) delete (spec as { statePayload?: unknown }).statePayload
    if ('triggerPollTopic' in (spec as object)) delete (spec as { triggerPollTopic?: unknown }).triggerPollTopic
    if ('commandTopicModbus' in (spec as object)) delete (spec as { commandTopicModbus?: unknown }).commandTopicModbus

    delete spec.publicSpecification
    if ('identified' in (spec as object)) delete (spec as { identified?: unknown }).identified
    // Never persist transient 'new' status
    if (spec.status === SpecificationStatus.new) {
      spec.status = SpecificationStatus.added
    }
  }
}
