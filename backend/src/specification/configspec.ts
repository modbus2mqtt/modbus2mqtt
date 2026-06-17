import { join } from 'path'
import { LogLevelEnum, Logger } from './log.js'
import {
  IimportMessages,
  ImodbusSpecification,
  ModbusRegisterType,
  SPECIFICATION_VERSION,
  SpecificationStatus,
  getBaseFilename,
  getSpecificationI18nName,
} from '../shared/specification/index.js'
import { IfileSpecification } from './ifilespecification.js'
import { SpecPersistence } from './specPersistence.js'

const log = new Logger('specification')
export const filesUrlPrefix = 'specifications/files'

export class ConfigSpecification {
  private static persistence: SpecPersistence

  static setMqttdiscoverylanguage(lang: string, ghToken?: string) {
    ConfigSpecification.mqttdiscoverylanguage = lang
    ConfigSpecification.githubPersonalToken = ghToken
  }
  static mqttdiscoverylanguage: string | undefined
  static githubPersonalToken: string | undefined
  static getPublicDir(): string {
    return join(ConfigSpecification.dataDir, 'public')
  }
  static getLocalDir(): string {
    return join(ConfigSpecification.configDir, 'modbus2mqtt')
  }
  constructor() {}

  private static persistenceConfigDir: string = ''
  private static persistenceDataDir: string = ''

  private static ensurePersistence(): SpecPersistence {
    if (
      !ConfigSpecification.persistence ||
      ConfigSpecification.persistenceConfigDir !== ConfigSpecification.configDir ||
      ConfigSpecification.persistenceDataDir !== ConfigSpecification.dataDir
    ) {
      ConfigSpecification.persistence = new SpecPersistence(ConfigSpecification.configDir, ConfigSpecification.dataDir)
      ConfigSpecification.persistenceConfigDir = ConfigSpecification.configDir
      ConfigSpecification.persistenceDataDir = ConfigSpecification.dataDir
    }
    return ConfigSpecification.persistence
  }

  private static specifications: IfileSpecification[] = []

  static resetForE2E(): void {
    ConfigSpecification.specifications = []
    ConfigSpecification.persistence = undefined as unknown as SpecPersistence
  }

  static dataDir: string = ''
  static configDir: string = ''

  // Reads all specifications from public + local directories via persistence layer.
  // Status comes from JSON attribute (local) or is 'published' (public).
  // For legacy YAML specs without status, it is derived from publicNames during read.
  readYaml(): void {
    try {
      const persistence = ConfigSpecification.ensurePersistence()

      const publishedSpecifications = persistence.readPublished()

      const publicNames = new Set(publishedSpecifications.map((s) => s.filename))
      ConfigSpecification.specifications = persistence.readLocal(publicNames)

      // Set publicSpecification references and copy files if needed
      ConfigSpecification.specifications.forEach((specification: IfileSpecification) => {
        const published = publishedSpecifications.find((obj) => obj.filename === specification.filename)
        if (published) {
          specification.publicSpecification = published
          if (specification.files.length == 0 && published.files.length > 0) specification.files = structuredClone(published.files)
        }
        if (specification.status === SpecificationStatus.contributed && specification.pullNumber == undefined)
          log.log(LogLevelEnum.error, 'Contributed Specification w/o pull request number: ' + specification.filename)
      })

      // Add published specs that have no local counterpart
      publishedSpecifications.forEach((specification: IfileSpecification) => {
        if (!ConfigSpecification.specifications.find((obj) => obj.filename === specification.filename)) {
          ConfigSpecification.specifications.push(specification)
        }
      })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      log.log(LogLevelEnum.error, 'readyaml failed: ' + msg)
      throw error
    }
  }
  filterAllSpecifications(specFunction: (spec: IfileSpecification) => void) {
    for (const spec of ConfigSpecification.specifications) {
      specFunction(spec)
    }
  }

  static emptyTestData = { holdingRegisters: [], coils: [], analogInputs: [], discreteInputs: [] }
  static toFileSpecification(modbusSpec: ImodbusSpecification): IfileSpecification {
    const fileSpec: IfileSpecification = structuredClone({
      ...modbusSpec,
      version: SPECIFICATION_VERSION,
      testdata: structuredClone(this.emptyTestData),
    })
    delete fileSpec['identification']

    modbusSpec.entities.forEach((entity) => {
      if (entity.modbusValue && entity.modbusAddress != undefined)
        for (let idx = 0; idx < entity.modbusValue.length; idx++) {
          switch (entity.registerType) {
            case ModbusRegisterType.AnalogInputs:
              fileSpec.testdata.analogInputs?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
            case ModbusRegisterType.HoldingRegister:
              fileSpec.testdata.holdingRegisters?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
            case ModbusRegisterType.Coils:
              fileSpec.testdata.coils?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
            case ModbusRegisterType.DiscreteInputs:
              fileSpec.testdata.discreteInputs?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
          }
        }
    })
    if (fileSpec.testdata.analogInputs?.length == 0) delete fileSpec.testdata.analogInputs
    if (fileSpec.testdata.holdingRegisters?.length == 0) delete fileSpec.testdata.holdingRegisters
    if (fileSpec.testdata.coils?.length == 0) delete fileSpec.testdata.coils
    if (fileSpec.testdata.discreteInputs?.length == 0) delete fileSpec.testdata.discreteInputs
    fileSpec.entities.forEach((entity) => {
      if ('modbusValue' in (entity as object)) delete (entity as { modbusValue?: unknown }).modbusValue
      if ('mqttValue' in (entity as object)) delete (entity as { mqttValue?: unknown }).mqttValue
      if ('identified' in (entity as object)) delete (entity as { identified?: unknown }).identified
    })
    return fileSpec
  }

  changeContributionStatus(filename: string, newStatus: SpecificationStatus, pullNumber?: number) {
    const spec = ConfigSpecification.specifications.find((f) => f.filename == filename)
    if (!spec) throw new Error('Specification ' + filename + ' not found')
    if (newStatus && newStatus == spec.status) return

    const persistence = ConfigSpecification.ensurePersistence()

    // Determine actual status for added/cloned based on public spec existence
    if (newStatus === SpecificationStatus.added || newStatus === SpecificationStatus.cloned) {
      newStatus = persistence.hasPublicSpec(spec.filename) ? SpecificationStatus.cloned : SpecificationStatus.added
      delete spec.pullNumber
    }

    spec.status = newStatus

    if (newStatus === SpecificationStatus.contributed) {
      spec.pullNumber = pullNumber
    }

    if (newStatus === SpecificationStatus.published) {
      // Delete local files — public directory already has the spec from GitHub fetch
      persistence.deleteLocalSpec(spec.filename)
    } else {
      // Rewrite JSON to local dir with updated status
      persistence.writeItem(spec.filename, spec)
    }
  }

  writeSpecificationFromFileSpec(spec: IfileSpecification, originalFilename: string | null, pullNumber?: number) {
    if (spec.filename == '_new') {
      throw new Error('No or invalid filename for specification')
    }

    const persistence = ConfigSpecification.ensurePersistence()

    // 1. Handle file renames (all in persistence)
    if (spec.status != SpecificationStatus.new && !originalFilename) {
      throw new Error(spec.status + ' !=' + SpecificationStatus.new + ' and no originalfilename')
    } else if (originalFilename && originalFilename != spec.filename) {
      if (
        spec.status == SpecificationStatus.cloned ||
        spec.status == SpecificationStatus.published ||
        spec.status == SpecificationStatus.contributed
      )
        throw new Error('Cannot rename a published file')
      persistence.renameSpec(spec.filename, originalFilename)
    }

    // 2. Copy public files if needed
    if (spec.files && spec.files.length && [SpecificationStatus.published].includes(spec.status)) {
      persistence.copyPublicFiles(spec.filename)
    }

    // 3. Determine status
    if (pullNumber != undefined) {
      spec.status = SpecificationStatus.contributed
    } else {
      const existingSpec = ConfigSpecification.specifications.find((s) => s.filename === spec.filename)
      if (existingSpec?.status === SpecificationStatus.contributed) {
        spec.status = SpecificationStatus.contributed
        spec.pullNumber = existingSpec.pullNumber
      } else {
        spec.status = persistence.hasPublicSpec(spec.filename) ? SpecificationStatus.cloned : SpecificationStatus.added
      }
    }

    // 4. Write (cleanup of old YAML is handled by writeItem via Migrator)
    persistence.writeItem(spec.filename, spec)

    // 5. Update in-memory array
    const idx = ConfigSpecification.specifications.findIndex((cspec) => {
      return cspec.filename === spec.filename
    })
    if (idx >= 0) ConfigSpecification.specifications[idx] = spec
    else ConfigSpecification.specifications.push(spec)
    return spec
  }
  writeSpecification(
    spec: ImodbusSpecification,
    onAfterSave: (filename: string) => void | undefined,
    originalFilename: string | null
  ): IfileSpecification {
    const fileSpec: IfileSpecification = ConfigSpecification.toFileSpecification(spec)
    this.writeSpecificationFromFileSpec(fileSpec, originalFilename)
    if (onAfterSave) onAfterSave(fileSpec.filename)
    return fileSpec
  }
  deleteSpecification(specfileName: string) {
    for (let idx = 0; idx < ConfigSpecification.specifications.length; idx++) {
      const sp = ConfigSpecification.specifications[idx]
      if (sp.filename === specfileName)
        if (sp.status in [SpecificationStatus.cloned, SpecificationStatus.added, SpecificationStatus.new])
          try {
            ConfigSpecification.ensurePersistence().deleteItem(sp.filename)
            log.log(LogLevelEnum.info, 'Specification removed: ' + sp.filename)
            return
          } catch {
            log.log(LogLevelEnum.error, 'Unable to remove Specification ' + sp.filename)
          } finally {
            this.readYaml()
          }
        else {
          log.log(LogLevelEnum.error, 'Unable to remove Specification ' + sp.filename + ': invalid status')
        }
    }
  }

  static getSpecificationByName(name: string): IfileSpecification | undefined {
    return structuredClone(
      ConfigSpecification.specifications.find((spec) => {
        return getSpecificationI18nName(spec, 'en') === name
      })
    )
  }
  static clearModbusData(spec: IfileSpecification) {
    spec.entities.forEach((ent) => {
      if ('modbusError' in (ent as object)) delete (ent as { modbusError?: unknown }).modbusError
      if ('modbusValue' in (ent as object)) delete (ent as { modbusValue?: unknown }).modbusValue
      if ('mqttValue' in (ent as object)) delete (ent as { mqttValue?: unknown }).mqttValue
      if ('identified' in (ent as object)) delete (ent as { identified?: unknown }).identified
    })
    if ('identified' in (spec as object)) delete (spec as { identified?: unknown }).identified
  }

  static getSpecificationByFilename(filename: string | undefined): IfileSpecification | undefined {
    if (filename == undefined) return undefined

    if (filename == '_new') {
      return {
        version: SPECIFICATION_VERSION,
        entities: [],
        files: [],
        i18n: [],
        testdata: structuredClone(this.emptyTestData),
        filename: '_new',
        status: SpecificationStatus.new,
      }
    }

    const rc = structuredClone(
      ConfigSpecification.specifications.find((spec) => {
        return spec.filename === filename
      })
    )
    if (rc) ConfigSpecification.clearModbusData(rc)
    return rc
  }
  static getFileNameFromSlaveId(slaveid: number): string {
    return 's' + slaveid
  }

  static importSpecificationJson(data: unknown): IimportMessages {
    const errors: IimportMessages = { warnings: '', errors: '' }

    if (!data || typeof data !== 'object') {
      errors.errors = 'Invalid JSON data'
      return errors
    }

    const spec = data as IfileSpecification
    if (!spec.filename) {
      errors.errors = 'Missing required field: filename'
      return errors
    }
    if (!spec.entities) {
      errors.errors = 'Missing required field: entities'
      return errors
    }

    const existing = ConfigSpecification.specifications.find((s) => s.filename === spec.filename)
    if (existing) {
      errors.warnings = 'Specification ' + spec.filename + ' already exists and will be overwritten\n'
    }

    try {
      const cs = new ConfigSpecification()
      if (existing) {
        cs.writeSpecificationFromFileSpec(spec, spec.filename)
      } else {
        spec.status = SpecificationStatus.new
        cs.writeSpecificationFromFileSpec(spec, null)
      }
    } catch (e: unknown) {
      errors.errors = e instanceof Error ? e.message : String(e)
    }

    return errors
  }
}

export function getSpecificationImageOrDocumentUrl(rootUrl: string | undefined, specName: string, url: string): string {
  const fn = getBaseFilename(url)
  let rc: string = ''
  if (rootUrl && rootUrl.length > 0) {
    let append = '/'
    if (rootUrl.endsWith('/')) append = ''
    rc = rootUrl + append + join(filesUrlPrefix, specName, fn)
  } else rc = join(filesUrlPrefix, specName, fn)

  return rc
}
