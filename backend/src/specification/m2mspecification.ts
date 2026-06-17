import { IspecificationValidator, IvalidateIdentificationResult } from './ispecificationvalidator.js'
import { join } from 'path'
import * as fs from 'fs'
import Debug from 'debug'
import { Idata, IfileSpecification } from './ifilespecification.js'
import { M2mGitHub } from './m2mgithub.js'
import {
  Imessage,
  MessageTypes,
  MessageCategories,
  VariableTargetParameters,
  getParameterType,
  validateTranslation,
  ModbusRegisterType,
} from '../shared/specification/index.js'
import {
  Ispecification,
  IbaseSpecification,
  SpecificationStatus,
  getSpecificationI18nName,
  ImodbusSpecification,
  getSpecificationI18nEntityName,
  SpecificationFileUsage,
  FileLocation,
  IdentifiedStates,
  ISpecificationText,
  ImodbusEntity,
  Inumber,
  IminMax,
  Iselect,
  Itext,
} from '../shared/specification/index.js'
import { ConfigSpecification } from './configspec.js'
import { ConverterMap } from './convertermap.js'
import { LogLevelEnum, Logger } from './log.js'
import { Observable, Subject } from 'rxjs'
import { IpullRequest } from './m2mGithubValidate.js'

const log = new Logger('m2mSpecification')
const debug = Debug('m2mspecification')
export interface IModbusResultOrError {
  data?: number[]
  error?: Error
}
export interface ImodbusValues {
  holdingRegisters: Map<number, IModbusResultOrError>
  analogInputs: Map<number, IModbusResultOrError>
  coils: Map<number, IModbusResultOrError>
  discreteInputs: Map<number, IModbusResultOrError>
}
export function emptyModbusValues(): ImodbusValues {
  return {
    holdingRegisters: new Map<number, IModbusResultOrError>(),
    coils: new Map<number, IModbusResultOrError>(),
    analogInputs: new Map<number, IModbusResultOrError>(),
    discreteInputs: new Map<number, IModbusResultOrError>(),
  }
}
interface Icontribution {
  pullRequest: number
  monitor: Subject<IpullRequest>
  pollCount: number
  interval?: NodeJS.Timeout
  m2mSpecification: M2mSpecification
  nextCheck?: string
}
export class M2mSpecification implements IspecificationValidator {
  private differentFilename = false
  private notBackwardCompatible = false
  private ghPollInterval: number[] = [5000, 30000, 30000, 60000, 60000, 60000, 5000 * 60, 5000 * 60 * 60, 1000 * 60 * 60 * 24]
  private ghPollIntervalIndex: number = 0
  private ghPollIntervalIndexCount: number = 0
  private static ghContributions = new Map<string, Icontribution>()

  constructor(private settings: Ispecification | ImodbusEntity[]) {
    {
      if (!(this.settings as ImodbusSpecification).i18n) {
        ;(this.settings as ImodbusSpecification) = {
          filename: '',
          i18n: [],
          files: [],
          status: SpecificationStatus.new,
          entities: this.settings as ImodbusEntity[],
          identified: IdentifiedStates.unknown,
        }
      }
    }
  }
  static messages2Text(spec: IbaseSpecification, msgs: Imessage[]): string {
    let errors: string = ''
    msgs.forEach((msg) => {
      if (msg.type != MessageTypes.identifiedByOthers) errors += M2mSpecification.getMessageString(spec, msg) + '\n'
    })
    return errors
  }
  async contribute(note: string | undefined): Promise<number> {
    const language = ConfigSpecification.mqttdiscoverylanguage
    let messages: Imessage[] = []

    if (language == undefined)
      messages.push({ type: MessageTypes.noMqttDiscoveryLanguage, category: MessageCategories.configuration })
    else messages = this.validate(language)
    const errors: string = M2mSpecification.messages2Text(this.settings as IbaseSpecification, messages)

    if (errors.length > 0) {
      throw new Error('Validation failed with errors: ' + errors)
    }

    if (errors.length == 0 && messages.length > 0 && (!note || note.length == 0))
      throw new Error('Validation failed with warning, but no note text available')
    const fileList = this.getSpecificationsFilesList(ConfigSpecification.getLocalDir())
    const spec = this.settings as IbaseSpecification
    let title = ''
    let message = ''
    switch (spec.status) {
      case SpecificationStatus.added: {
        title = 'Add specification '
        message = this.generateAddedContributionMessage()
        break
      }
      case SpecificationStatus.cloned: {
        title = 'Update specification '
        const pub = (spec as unknown as { publicSpecification?: IfileSpecification }).publicSpecification
        message = this.generateClonedContributionMessage(note, pub)
        break
      }
    }
    title = title + getSpecificationI18nName(spec, language!)
    if (!ConfigSpecification.githubPersonalToken || !ConfigSpecification.githubPersonalToken.length) {
      throw new Error('Github connection is not configured. Set Github Personal Acces Token in configuration UI first')
    }
    const github = new M2mGitHub(ConfigSpecification.githubPersonalToken, ConfigSpecification.getPublicDir())
    try {
      await github.init()
      await github.commitFiles(ConfigSpecification.getLocalDir(), spec.filename, fileList, title, message)
      const issue = await github.createPullrequest(title, message, spec.filename)
      new ConfigSpecification().changeContributionStatus(
        (this.settings as IbaseSpecification).filename,
        SpecificationStatus.contributed,
        issue
      )
      return issue
    } catch (e: unknown) {
      if (spec.status == SpecificationStatus.contributed)
        new ConfigSpecification().changeContributionStatus(spec.filename, SpecificationStatus.added)
      try {
        await github.deleteSpecBranch(spec.filename)
      } catch (e1: unknown) {
        log.log(LogLevelEnum.error, 'delete branch: ' + (e1 as Error).message)
      }
      throw e
    }
  }

  private generateAddedContributionMessage(): string {
    // First contribution:
    // Name of Specification(en)
    const spec = this.settings as ImodbusSpecification
    let message = `First contribution of ${getSpecificationI18nName(spec, 'en')}(${spec.filename}) \nEntities:\n`
    message = `${message}Languages: `
    spec.i18n.forEach((l) => {
      message = `${message} ${l.lang} `
    })
    message = `${message}\nEntities:\n`
    spec.entities.forEach((ent) => {
      message = `${message}\t${getSpecificationI18nEntityName(spec, 'en', ent.id)}\n`
    })
    message = `${message}\nImages:\n`
    spec.files.forEach((file) => {
      if (file.usage == SpecificationFileUsage.img) message = `${message}\t ${file.url}\n`
    })
    message = `${message}\nDocumentation:\n`
    spec.files.forEach((file) => {
      if (file.usage == SpecificationFileUsage.documentation) message = `${message}\t ${file.url}\n`
    })
    return message
  }

  private generateClonedContributionMessage(note: string | undefined, publicSpecification: IfileSpecification | undefined): string {
    let rcmessage = ''
    this.notBackwardCompatible = false
    this.differentFilename = false
    if (publicSpecification) {
      rcmessage = rcmessage + 'Changes:\n'
      const messages = this.isEqual(publicSpecification)
      messages.forEach((message) => {
        rcmessage = rcmessage + M2mSpecification.getMessageString(this.settings as IbaseSpecification, message) + '\n'
      })
      // TODO Check backward compatibility
      if (this.notBackwardCompatible) {
        rcmessage = rcmessage + '\n!!! There are changes which are not backward compatible !!'
        if (note == undefined) throw new Error('There are changes which are not backward compatible')
      }

      if (note != undefined) rcmessage = rcmessage + '\n' + note
    }
    return rcmessage
  }
  static getMessageString(spec: IbaseSpecification, message: Imessage): string {
    switch (message.type) {
      case MessageTypes.noDocumentation:
        return `No documenation file or URL`
      case MessageTypes.nameTextMissing:
        return `The specification has no Name`
      case MessageTypes.entityTextMissing:
        return `entity has no name`
      case MessageTypes.translationMissing: {
        const info = message.additionalInformation
        const text = Array.isArray(info) ? info.join(', ') : (info ?? '')
        return `A translation is missing: ` + text
      }
      case MessageTypes.noEntity:
        return `No entity defined for this specification`
      // duplicate removed: MessageTypes.noDocumentation handled above
      case MessageTypes.noImage:
        return `No image file or URL`
      case MessageTypes.nonUniqueName:
        return `Specification name is not unique`
      case MessageTypes.identifiedByOthers: {
        const info = message.additionalInformation
        const names = Array.isArray(info) ? info : []
        const specNames = names.join(' ')
        return `Test data of this specification matches to the following other public specifications ${specNames}`
      }
      // duplicate removed: MessageTypes.nonUniqueName handled above
      case MessageTypes.notIdentified:
        return ` The specification can not be identified with it's test data`
      case MessageTypes.differentFilename:
        return M2mSpecification.getMessageLocal(
          spec,
          message,
          'Filename has been changed. A new public specification will be created'
        )
      case MessageTypes.missingEntity:
        return M2mSpecification.getMessageLocal(spec, message, 'Entity has been removed')
      case MessageTypes.differentConverter:
        return M2mSpecification.getMessageLocal(spec, message, 'Converter has been changed')
      case MessageTypes.addedEntity:
        return M2mSpecification.getMessageLocal(spec, message, 'Entity has been added')
      case MessageTypes.differentModbusAddress:
        return M2mSpecification.getMessageLocal(spec, message, 'Modbus address has been changed')
      case MessageTypes.differentFunctionCode:
        return M2mSpecification.getMessageLocal(spec, message, 'Function code has been changed')
      case MessageTypes.differentIcon:
        return M2mSpecification.getMessageLocal(spec, message, 'Icon has been changed')
      case MessageTypes.differentTargetParameter:
        return M2mSpecification.getMessageLocal(spec, message, 'Variable configuration: Target parameter has been changed')
      case MessageTypes.differentVariableEntityId:
        return M2mSpecification.getMessageLocal(spec, message, 'Variable configuration: Referenced entity has been changed')
      case MessageTypes.differentVariableConfiguration:
        return M2mSpecification.getMessageLocal(spec, message, 'Variable configuration has been changed')
      case MessageTypes.differentDeviceClass:
        return M2mSpecification.getMessageLocal(spec, message, 'Device class has been changed')
      case MessageTypes.differentIdentificationMax:
        return M2mSpecification.getMessageLocal(spec, message, 'Max value has been changed')
      case MessageTypes.differentIdentificationMin:
        return M2mSpecification.getMessageLocal(spec, message, 'Min value has been changed')
      case MessageTypes.differentIdentification:
        return M2mSpecification.getMessageLocal(spec, message, 'Identification has been changed')
      case MessageTypes.differentMultiplier:
        return M2mSpecification.getMessageLocal(spec, message, 'Multiplier has been changed')
      case MessageTypes.differentOffset:
        return M2mSpecification.getMessageLocal(spec, message, 'Offset has been changed')
      case MessageTypes.differentOptionTable:
        return M2mSpecification.getMessageLocal(spec, message, 'Options have been changed')
      case MessageTypes.differentStringlength:
        return M2mSpecification.getMessageLocal(spec, message, 'String length has been changed')
      case MessageTypes.differentManufacturer:
        return M2mSpecification.getMessageLocal(spec, message, 'Manufacturer has been changed')
      case MessageTypes.differentModel:
        return M2mSpecification.getMessageLocal(spec, message, 'Model has been changed')
      case MessageTypes.differentTranslation:
        return M2mSpecification.getMessageLocal(spec, message, 'Translation has been changed')

      case MessageTypes.noMqttDiscoveryLanguage:
        return M2mSpecification.getMessageLocal(spec, message, 'MQTT Discovery Langauge is not configured')
    }
    return 'unknown MessageType : ' + message.type
  }
  private static getMessageLocal(
    spec: IbaseSpecification,
    message: Imessage,
    messageText: string,
    notBackwardCompatible?: boolean
  ): string {
    const msg = structuredClone(messageText)
    if (message.referencedEntity != undefined)
      return msg + ' ' + getSpecificationI18nEntityName(spec as IbaseSpecification, 'en', message.referencedEntity)
    if (message.additionalInformation != undefined) return msg + ' ' + message.additionalInformation
    if (!notBackwardCompatible) return ' This will break compatibilty with previous version'
    return msg
  }
  private static throwCloseContributionError(msg: string): never {
    log.log(LogLevelEnum.error, msg)
    const e = new Error(msg) as Error & { step?: string }
    e.step = 'closeContribution'
    throw e
  }
  static async closeContribution(spec: IfileSpecification): Promise<IpullRequest> {
    if (undefined == ConfigSpecification.githubPersonalToken) {
      this.throwCloseContributionError('No Github Personal Access Token configured. Unable to close contribution ' + spec.filename)
    }
    if (spec.pullNumber == undefined) {
      this.throwCloseContributionError('No Pull Number in specification. Unable to close contribution ' + spec.filename)
    }
    const gh = new M2mGitHub(ConfigSpecification.githubPersonalToken!, join(ConfigSpecification.getPublicDir()))
    try {
      await gh.init()
      const pullStatus = await gh.getPullRequest(spec.pullNumber!)
      const cspec = new ConfigSpecification()
      if (pullStatus.merged) {
        cspec.changeContributionStatus(spec.filename, SpecificationStatus.published, undefined)
      } else if (pullStatus.closed_at != null) {
        cspec.changeContributionStatus(spec.filename, SpecificationStatus.added, undefined)
      }
      spec = ConfigSpecification.getSpecificationByFilename(spec.filename)!
      if (spec.status != SpecificationStatus.contributed) gh.deleteSpecBranch(spec.filename)
      gh.fetchPublicFiles()
      return { merged: pullStatus.merged, closed: pullStatus.closed_at != null, pullNumber: spec.pullNumber! }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.throwCloseContributionError('closeContribution: ' + msg)
    }
  }
  getSpecificationsFilesList(localDir: string): string[] {
    const files: string[] = []
    const spec = this.settings as IbaseSpecification
    spec.files.forEach((file) => {
      const filePath = file.url.replace(/^\//g, '')
      if (file.fileLocation == FileLocation.Local && fs.existsSync(join(localDir, filePath))) files.push(filePath)
    })
    files.push(join('specifications', spec.filename + '.json'))
    return files
  }

  validate(language: string): Imessage[] {
    const rc = this.validateSpecification(language, true)
    if ((this.settings as ImodbusSpecification).entities.length > 0) {
      let mSpec = this.settings as ImodbusSpecification
      if (mSpec.identified == undefined) mSpec = M2mSpecification.fileToModbusSpecification(this.settings as IfileSpecification)
      else M2mSpecification.setIdentifiedByEntities(mSpec)

      if (mSpec.identified != IdentifiedStates.identified)
        rc.push({ type: MessageTypes.notIdentified, category: MessageCategories.validateSpecification })
    }

    if (!this.validateUniqueName(language))
      rc.push({ type: MessageTypes.nonUniqueName, category: MessageCategories.validateSpecification })
    return rc
  }

  validateUniqueName(language: string): boolean {
    const name = getSpecificationI18nName(this.settings as IbaseSpecification, language)
    let rc = true
    new ConfigSpecification().filterAllSpecifications((spec) => {
      if (rc && (this.settings as IbaseSpecification).filename != spec.filename) {
        const texts = spec.i18n.find((lang) => lang.lang == language)
        if (texts && texts.texts)
          if ((texts.texts as ISpecificationText[]).find((text) => text.textId == 'name' && text.text == name)) rc = false
      }
    })
    return rc
  }
  private static setIdentifiedByEntities(mSpec: ImodbusSpecification) {
    mSpec.identified = IdentifiedStates.unknown
    mSpec.entities.forEach((ent) => {
      switch (ent.identified) {
        case IdentifiedStates.notIdentified:
          mSpec.identified = IdentifiedStates.notIdentified
          break
        case IdentifiedStates.identified:
          if (mSpec.identified == undefined || mSpec.identified == IdentifiedStates.unknown)
            mSpec.identified = IdentifiedStates.identified
          break
      }
    })
  }

  static fileToModbusSpecification(inSpec: IfileSpecification, values?: ImodbusValues): ImodbusSpecification {
    let valuesLocal = values
    if (valuesLocal == undefined) {
      valuesLocal = emptyModbusValues()
    }
    ConfigSpecification.clearModbusData(inSpec)
    // copy from test data if there are no values passed
    if (
      values == undefined &&
      inSpec.testdata &&
      ((inSpec.testdata.analogInputs && inSpec.testdata.analogInputs.length > 0) ||
        (inSpec.testdata.holdingRegisters && inSpec.testdata.holdingRegisters.length > 0) ||
        (inSpec.testdata.coils && inSpec.testdata.coils.length > 0) ||
        (inSpec.testdata.discreteInputs && inSpec.testdata.discreteInputs.length > 0))
    ) {
      M2mSpecification.copyFromTestData(inSpec.testdata.holdingRegisters, valuesLocal.holdingRegisters)
      M2mSpecification.copyFromTestData(inSpec.testdata.analogInputs, valuesLocal.analogInputs)
      M2mSpecification.copyFromTestData(inSpec.testdata.coils, valuesLocal.coils)
      M2mSpecification.copyFromTestData(inSpec.testdata.discreteInputs, valuesLocal.discreteInputs)
    } else {
      // No values available neither testdata nor
    }

    const rc: ImodbusSpecification = Object.assign(inSpec)
    for (let entityIndex = 0; entityIndex < inSpec.entities.length; entityIndex++) {
      const entity = rc.entities[entityIndex]
      const converter = ConverterMap.getConverter(entity)
      // Process modbus-backed entities (address + registerType) as well as static entities
      // (e.g. a fixed OBIS code) whose converter has no modbus address.
      if ((entity.modbusAddress != undefined && entity.registerType) || (converter && !converter.usesModbusAddress())) {
        const sm = M2mSpecification.copyModbusDataToEntity(rc, entity.id, valuesLocal)
        if (sm) {
          rc.entities[entityIndex] = sm
        }
      }
    }
    M2mSpecification.setIdentifiedByEntities(rc)

    return rc
  }

  static copyModbusDataToEntity(spec: Ispecification, entityId: number, values: ImodbusValues): ImodbusEntity {
    const entity = spec.entities.find((ent) => entityId == ent.id)
    if (entity) {
      const rc: ImodbusEntity = structuredClone(entity) as ImodbusEntity
      const converter = ConverterMap.getConverter(entity)
      if (converter) {
        if (entity.modbusAddress != undefined) {
          try {
            let data: number[] = []
            for (
              let address = entity.modbusAddress;
              address < entity.modbusAddress + converter.getModbusLength(entity);
              address++
            ) {
              let value: IModbusResultOrError | undefined = {}

              switch (entity.registerType) {
                case ModbusRegisterType.AnalogInputs:
                  value = values.analogInputs.get(address)
                  break
                case ModbusRegisterType.HoldingRegister:
                  value = values.holdingRegisters.get(address)
                  break
                case ModbusRegisterType.Coils:
                  value = values.coils.get(address)
                  break
                case ModbusRegisterType.DiscreteInputs:
                  value = values.discreteInputs.get(address)
                  break
              }
              if (value && value.data) {
                data = data!.concat(value.data!)
              }
              // Only the last error will survive
              // last error is ignored in previous implementation; no-op
            }
            if (data && data.length > 0) {
              const mqtt = converter.modbus2mqtt(spec, entity.id, data)
              let identified = IdentifiedStates.unknown
              if (entity.converterParameters)
                if (entity.converter === 'number') {
                  if (!(entity.converterParameters as Inumber).identification)
                    (entity as ImodbusEntity).identified = IdentifiedStates.unknown
                  else {
                    //Inumber
                    const mm: IminMax = (entity.converterParameters as Inumber).identification!
                    identified =
                      mm.min <= (mqtt as number) && (mqtt as number) <= mm.max
                        ? IdentifiedStates.identified
                        : IdentifiedStates.notIdentified
                  }
                } else {
                  if (!(entity.converterParameters as Itext).identification) {
                    if (
                      (entity.converterParameters as Iselect).options ||
                      (entity.converterParameters as Iselect).optionModbusValues
                    ) {
                      // Iselect
                      identified = mqtt != null ? IdentifiedStates.identified : IdentifiedStates.notIdentified
                    } else {
                      // no Converter parameters
                      identified = (mqtt as string).length ? IdentifiedStates.identified : IdentifiedStates.unknown
                    }
                  } else {
                    // Itext
                    const reg = (entity.converterParameters as Itext).identification
                    if (reg) {
                      const re = new RegExp('^' + reg + '$')
                      identified = re.test(mqtt as string) ? IdentifiedStates.identified : IdentifiedStates.notIdentified
                    }
                  }
                }
              rc.identified = identified
              rc.mqttValue = mqtt
              rc.modbusValue = data
            } else {
              rc.identified = IdentifiedStates.notIdentified
              rc.mqttValue = ''
              rc.modbusValue = []
            }
          } catch (error) {
            log.log(LogLevelEnum.error, error)
          }
        } else if (!converter.usesModbusAddress()) {
          // Static entity (e.g. a fixed OBIS code via the 'value' converter): the value does
          // not come from modbus, so compute it directly from the converter parameters.
          const mqtt = converter.modbus2mqtt(spec, entity.id, [])
          rc.mqttValue = mqtt
          rc.modbusValue = []
          rc.identified = mqtt != null && mqtt.toString().length > 0 ? IdentifiedStates.identified : IdentifiedStates.notIdentified
        } else {
          log.log(LogLevelEnum.error, 'entity has no modbusaddress: entity id:' + entity.id + ' converter:' + entity.converter)
          // It remains an Ientity
        }
      } else
        log.log(LogLevelEnum.error, 'Converter not found: ' + spec.filename + ' ' + entity.converter + ' entity id: ' + +entity.id)

      return rc
    } else {
      const msg = 'EntityId ' + entityId + ' not found in specifcation '
      log.log(LogLevelEnum.error, msg)
      throw new Error(msg)
    }
  }
  private static copyFromTestData(testdata: Idata[] | undefined, data: Map<number, IModbusResultOrError>) {
    if (testdata)
      testdata.forEach((mv) => {
        if (mv.value != undefined)
          data.set(mv.address, {
            data: [mv.value],
            error: mv.error ? new Error(mv.error) : undefined,
          })
        else data.set(mv.address, { error: mv.error ? new Error(mv.error) : undefined })
      })
  }

  validateIdentification(language: string): IvalidateIdentificationResult[] {
    const identifiedSpecs: IvalidateIdentificationResult[] = []
    const values = emptyModbusValues()
    let fSettings: IfileSpecification
    if ((this.settings as IfileSpecification).testdata) fSettings = this.settings as IfileSpecification
    else fSettings = ConfigSpecification.toFileSpecification(this.settings as ImodbusSpecification)
    if (fSettings.testdata.holdingRegisters)
      M2mSpecification.copyFromTestData(fSettings.testdata.holdingRegisters, values.holdingRegisters)
    if (fSettings.testdata.analogInputs) M2mSpecification.copyFromTestData(fSettings.testdata.analogInputs, values.analogInputs)
    if (fSettings.testdata.coils) M2mSpecification.copyFromTestData(fSettings.testdata.coils, values.coils)
    if (fSettings.testdata.discreteInputs)
      M2mSpecification.copyFromTestData(fSettings.testdata.discreteInputs, values.discreteInputs)
    new ConfigSpecification().filterAllSpecifications((spec) => {
      if ([SpecificationStatus.cloned, SpecificationStatus.published, SpecificationStatus.contributed].includes(spec.status)) {
        let mSpec: ImodbusSpecification | undefined = undefined
        let fSpec: IfileSpecification = spec

        switch (spec.status) {
          case SpecificationStatus.published:
            mSpec = M2mSpecification.fileToModbusSpecification(spec, values)
            break
          case SpecificationStatus.contributed:
            if (spec.publicSpecification) {
              mSpec = M2mSpecification.fileToModbusSpecification(spec.publicSpecification, values)
              fSpec = spec.publicSpecification
            } else mSpec = M2mSpecification.fileToModbusSpecification(spec, values)
            break
          case SpecificationStatus.cloned:
            if (spec.publicSpecification) {
              mSpec = M2mSpecification.fileToModbusSpecification(spec.publicSpecification, values)
              fSpec = spec.publicSpecification
            } else log.log(LogLevelEnum.error, 'Cloned Specification with no public Specification ' + spec.filename)
            break
          default:
            mSpec = M2mSpecification.fileToModbusSpecification(fSpec, values)
        }
        const specName = getSpecificationI18nName(spec, language)
        if (fSettings.filename != spec.filename) {
          const allMatch = this.allNullValuesMatch(spec, values)
          if (allMatch && mSpec && mSpec.identified == IdentifiedStates.identified) {
            const ent = mSpec.entities.find((ent) => ent.identified == IdentifiedStates.notIdentified)
            if (specName) identifiedSpecs.push({ specname: specName, referencedEntity: ent?.id })
            else identifiedSpecs.push({ specname: 'unknown', referencedEntity: ent?.id })
          }
        }
      }
    })
    return identifiedSpecs
  }
  allNullDataMatch(datas: Idata[] | undefined, values: Map<number, IModbusResultOrError>): boolean {
    let rc = true
    if (datas)
      datas.forEach((data) => {
        if (data.value == null && values.get(data.address) != null) rc = false
      })
    return rc
  }
  allNullValuesMatch(spec: IfileSpecification, values: ImodbusValues): boolean {
    let rc = this.allNullDataMatch(spec.testdata.holdingRegisters, values.holdingRegisters)
    if (!rc) return false
    rc = this.allNullDataMatch(spec.testdata.analogInputs, values.analogInputs)
    if (!rc) return false
    return this.allNullDataMatch(spec.testdata.coils, values.coils)
  }
  private getPropertyFromVariable(entityId: number, targetParameter: VariableTargetParameters): string | number | undefined {
    const ent = (this.settings as ImodbusSpecification).entities.find(
      (e) =>
        e.variableConfiguration &&
        e.variableConfiguration.targetParameter == targetParameter &&
        e.variableConfiguration.entityId &&
        e.variableConfiguration.entityId == entityId
    )
    if (ent) return ent.mqttValue
    return undefined
  }
  private getEntityFromId(entityId: number): ImodbusEntity | undefined {
    const ent = (this.settings as ImodbusSpecification).entities.find((e) => e.id == entityId)
    if (!ent) return undefined
    return ent
  }
  static getFileUsage(url: string): SpecificationFileUsage {
    const name = url.toLowerCase()
    if (name.endsWith('.pdf')) return SpecificationFileUsage.documentation
    if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.bmp'))
      return SpecificationFileUsage.img
    return SpecificationFileUsage.documentation
  }
  getUom(entityId: number): string | undefined {
    const rc = this.getPropertyFromVariable(entityId, VariableTargetParameters.entityUom)
    if (rc) return rc as string | undefined
    const ent = this.getEntityFromId(entityId)
    if (!ent || !ent.converterParameters || !(ent.converterParameters as Inumber)!.uom) return undefined

    return (ent.converterParameters as Inumber)!.uom
  }
  getMultiplier(entityId: number): number | undefined {
    const rc = this.getPropertyFromVariable(entityId, VariableTargetParameters.entityMultiplier)
    if (rc) return rc as number | undefined
    const ent = this.getEntityFromId(entityId)
    if (!ent || !ent.converterParameters || undefined == (ent.converterParameters as Inumber)!.multiplier) return undefined

    return (ent.converterParameters as Inumber)!.multiplier
  }
  getDecimals(entityId: number): number | undefined {
    //    let rc = this.getPropertyFromVariable(entityId, VariableTargetParameters.entityMultiplier)
    //    if (rc) return rc as number | undefined
    const ent = this.getEntityFromId(entityId)
    if (!ent || !ent.converterParameters || undefined == (ent.converterParameters as Inumber)!.decimals) return undefined

    return (ent.converterParameters as Inumber)!.decimals
  }
  getOffset(entityId: number): number | undefined {
    const rc = this.getPropertyFromVariable(entityId, VariableTargetParameters.entityOffset)
    if (rc) return rc as number | undefined
    const ent = this.getEntityFromId(entityId)
    if (!ent || !ent.converterParameters || (ent.converterParameters as Inumber)!.offset == undefined) return undefined
    return (ent.converterParameters as Inumber)!.offset
  }
  isVariable(checkParameter: VariableTargetParameters): boolean {
    const ent = (this.settings as ImodbusSpecification).entities.find(
      (e) => e.variableConfiguration && e.variableConfiguration.targetParameter == checkParameter
    )
    return ent != undefined
  }

  isEqualValue(v1: unknown, v2: unknown): boolean {
    if (v1 == null && v2 == null) return true
    if (v1 != null && v2 != null && (v1 as unknown) == (v2 as unknown)) return true
    return false
  }
  isEqual(other: Ispecification): Imessage[] {
    const rc: Imessage[] = []
    const spec = this.settings as ImodbusSpecification
    if (spec.filename != other.filename) rc.push({ type: MessageTypes.differentFilename, category: MessageCategories.compare })
    spec.entities.forEach((ent) => {
      if (!other.entities.find((oent) => oent.id == ent.id))
        rc.push({ type: MessageTypes.addedEntity, category: MessageCategories.compareEntity, referencedEntity: ent.id })
    })
    other.entities.forEach((oent) => {
      const ent = spec.entities.find((ent) => oent.id == ent.id)
      if (!ent)
        rc.push({
          type: MessageTypes.missingEntity,
          category: MessageCategories.compare,
          additionalInformation: getSpecificationI18nEntityName(other, 'en', oent.id) ?? undefined,
        })
      else {
        if (!this.isEqualValue(oent.converter, ent.converter))
          rc.push({ type: MessageTypes.differentConverter, category: MessageCategories.compareEntity, referencedEntity: ent.id })
        if (!this.isEqualValue(oent.modbusAddress, ent.modbusAddress))
          rc.push({
            type: MessageTypes.differentModbusAddress,
            category: MessageCategories.compareEntity,
            referencedEntity: ent.id,
          })
        if (!this.isEqualValue(oent.registerType, ent.registerType))
          rc.push({ type: MessageTypes.differentFunctionCode, category: MessageCategories.compareEntity, referencedEntity: ent.id })
        if (!this.isEqualValue(oent.icon, ent.icon))
          rc.push({ type: MessageTypes.differentIcon, category: MessageCategories.compareEntity, referencedEntity: ent.id })
        if (oent.variableConfiguration && ent.variableConfiguration) {
          if (!this.isEqualValue(oent.variableConfiguration.targetParameter, ent.variableConfiguration.targetParameter))
            rc.push({
              type: MessageTypes.differentTargetParameter,
              category: MessageCategories.compareEntity,
              referencedEntity: ent.id,
            })
          else if (!this.isEqualValue(oent.variableConfiguration.entityId, ent.variableConfiguration.entityId))
            rc.push({
              type: MessageTypes.differentVariableEntityId,
              category: MessageCategories.compareEntity,
              referencedEntity: ent.id,
            })
        } else if (oent.variableConfiguration || ent.variableConfiguration)
          rc.push({
            type: MessageTypes.differentVariableConfiguration,
            category: MessageCategories.compareEntity,
            referencedEntity: ent.id,
          })
        if (ent.converterParameters && oent.converterParameters)
          switch (getParameterType(oent.converter)) {
            case 'Inumber':
              if (
                !this.isEqualValue(
                  (oent.converterParameters as Inumber).device_class,
                  (ent.converterParameters as Inumber).device_class
                )
              )
                rc.push({
                  type: MessageTypes.differentDeviceClass,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              if ((oent.converterParameters as Inumber).identification && (ent.converterParameters as Inumber).identification) {
                if (
                  !this.isEqualValue(
                    (oent.converterParameters as Inumber).identification!.max,
                    (ent.converterParameters as Inumber).identification!.max
                  )
                )
                  rc.push({
                    type: MessageTypes.differentIdentificationMax,
                    category: MessageCategories.compareEntity,
                    referencedEntity: ent.id,
                  })
                else if (
                  !this.isEqualValue(
                    (oent.converterParameters as Inumber).identification!.min,
                    (ent.converterParameters as Inumber).identification!.min
                  )
                )
                  rc.push({
                    type: MessageTypes.differentIdentificationMin,
                    category: MessageCategories.compareEntity,
                    referencedEntity: ent.id,
                  })
              } else if (
                (oent.converterParameters as Inumber).identification ||
                (ent.converterParameters as Inumber).identification
              )
                rc.push({
                  type: MessageTypes.differentIdentification,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              if (
                !this.isEqualValue(
                  (oent.converterParameters as Inumber).multiplier,
                  (ent.converterParameters as Inumber).multiplier
                )
              )
                rc.push({
                  type: MessageTypes.differentMultiplier,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              if (!this.isEqualValue((oent.converterParameters as Inumber).offset, (ent.converterParameters as Inumber).offset))
                rc.push({ type: MessageTypes.differentOffset, category: MessageCategories.compareEntity, referencedEntity: ent.id })
              break
            case 'Iselect':
              if (
                JSON.stringify((oent.converterParameters as Iselect).optionModbusValues) !=
                JSON.stringify((ent.converterParameters as Iselect).optionModbusValues)
              )
                rc.push({
                  type: MessageTypes.differentOptionTable,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              break
            case 'Itext':
              if (
                !this.isEqualValue(
                  (oent.converterParameters as Itext).stringlength,
                  (ent.converterParameters as Itext).stringlength
                )
              )
                rc.push({
                  type: MessageTypes.differentStringlength,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              if (
                !this.isEqualValue(
                  (oent.converterParameters as Itext).identification,
                  (ent.converterParameters as Itext).identification
                )
              )
                rc.push({
                  type: MessageTypes.differentIdentification,
                  category: MessageCategories.compareEntity,
                  referencedEntity: ent.id,
                })
              break
          }
      }
    })

    if (JSON.stringify(spec.i18n) != JSON.stringify(other.i18n))
      rc.push({ type: MessageTypes.differentTranslation, category: MessageCategories.compare })
    if (!this.isEqualValue(spec.manufacturer, other.manufacturer))
      rc.push({ type: MessageTypes.differentManufacturer, category: MessageCategories.compare })
    if (!this.isEqualValue(spec.model, other.model))
      rc.push({ type: MessageTypes.differentModel, category: MessageCategories.compare })
    if (!this.isEqualValue(spec.identification, other.identification))
      rc.push({ type: MessageTypes.differentIdentification, category: MessageCategories.compare })
    return rc
  }

  validateFiles(msgs: Imessage[]) {
    const category = MessageCategories.validateFiles
    const spec = this.settings as ImodbusSpecification
    let hasDocumentation = false
    let hasImage = false
    spec.files.forEach((f) => {
      if (f.usage == SpecificationFileUsage.documentation) hasDocumentation = true
      if (f.usage == SpecificationFileUsage.img) hasImage = true
    })
    if (!hasDocumentation) msgs.push({ type: MessageTypes.noDocumentation, category: category })
    if (!hasImage) msgs.push({ type: MessageTypes.noImage, category: category })
  }
  validateSpecification(language: string, forContribution: boolean = false): Imessage[] {
    const msgs: Imessage[] = []
    const spec = this.settings as ImodbusSpecification
    this.validateFiles(msgs)
    if (spec.entities.length == 0) msgs.push({ type: MessageTypes.noEntity, category: MessageCategories.validateEntity })
    validateTranslation(spec, language, msgs)
    if (forContribution) validateTranslation(spec, 'en', msgs)
    return msgs
  }
  getBaseFilename(filename: string): string {
    const idx = filename.lastIndexOf('/')
    if (idx >= 0) return filename.substring(idx + 1)
    return filename
  }
  private static pollingTimeout = 15 * 1000
  static startPolling(specfilename: string, error: (e: unknown) => void): Observable<IpullRequest> | undefined {
    debug('startPolling')
    const spec = ConfigSpecification.getSpecificationByFilename(specfilename)
    const contribution = M2mSpecification.ghContributions.get(specfilename)
    if (contribution == undefined && spec && spec.pullNumber) {
      log.log(LogLevelEnum.info, 'startPolling for pull Number ' + spec.pullNumber)
      const mspec = new M2mSpecification(spec as Ispecification)
      const c: Icontribution = {
        pullRequest: spec.pullNumber,
        monitor: new Subject<IpullRequest>(),
        pollCount: 0,
        m2mSpecification: mspec,
        interval: setInterval(() => {
          M2mSpecification.poll(spec!.filename, error)
        }, M2mSpecification.pollingTimeout),
      }
      M2mSpecification.ghContributions.set(spec.filename, c)
      return c.monitor
    }
    return undefined
  }
  static getNextCheck(specfilename: string): string {
    const c = M2mSpecification.ghContributions.get(specfilename)
    if (c && c.nextCheck) return c.nextCheck
    return ''
  }
  static triggerPoll(specfilename: string): void {
    const c = M2mSpecification.ghContributions.get(specfilename)
    if (c && c.m2mSpecification) {
      c.pollCount = 0
      c.m2mSpecification.ghPollIntervalIndexCount = 0
    }
  }
  static msToTime(ms: number) {
    const seconds: number = ms / 1000
    const minutes: number = ms / (1000 * 60)
    const hours: number = ms / (1000 * 60 * 60)
    const days: number = ms / (1000 * 60 * 60 * 24)
    if (seconds < 60) return seconds.toFixed(1) + ' Sec'
    else if (minutes < 60) return minutes.toFixed(1) + ' Min'
    else if (hours < 24) return hours.toFixed(1) + ' Hrs'
    else return days.toFixed(1) + ' Days'
  }

  private static inCloseContribution: boolean = false
  private static poll(specfilename: string, error: (e: unknown) => void) {
    const contribution = M2mSpecification.ghContributions.get(specfilename)
    const spec = contribution?.m2mSpecification.settings as IfileSpecification
    if (
      ConfigSpecification.githubPersonalToken == undefined ||
      spec.status != SpecificationStatus.contributed ||
      spec.pullNumber == undefined
    )
      return

    if (contribution == undefined) {
      const msg = 'Unexpected undefined contribution'
      log.log(LogLevelEnum.error, msg)
      error(new Error(msg))
    } else {
      if (
        contribution.pollCount >
        contribution.m2mSpecification.ghPollInterval[contribution.m2mSpecification.ghPollIntervalIndex] / 100
      )
        contribution.pollCount = 0
      else {
        const interval = contribution.m2mSpecification.ghPollInterval[contribution.m2mSpecification.ghPollIntervalIndex] / 100
        const nextCheckTotalMs = (interval - contribution.pollCount) * 100
        contribution.nextCheck = M2mSpecification.msToTime(nextCheckTotalMs)
      }
      if (contribution.pollCount == 0) {
        // Set ghPollIntervalIndex (Intervall duration)
        // 10 * every 5 second, 10 * every 5 minutes, 10 * every 5 hours, then once a day
        if (
          contribution.m2mSpecification.ghPollIntervalIndexCount++ >= 10 &&
          contribution.m2mSpecification.ghPollIntervalIndex < contribution.m2mSpecification.ghPollInterval.length - 1
        ) {
          contribution.m2mSpecification.ghPollIntervalIndex++
          contribution.m2mSpecification.ghPollIntervalIndexCount = 0
        }
        if (!M2mSpecification.inCloseContribution) {
          M2mSpecification.inCloseContribution = true
          M2mSpecification.closeContribution(spec)
            .then((pullStatus) => {
              debug('contribution closed for pull Number ' + spec.pullNumber)
              if (contribution) {
                contribution.monitor.next(pullStatus)
                if (pullStatus.closed || pullStatus.merged) {
                  clearInterval(contribution.interval)
                  M2mSpecification.ghContributions.delete(spec.filename)
                  contribution.monitor.complete()
                }
              }
            })
            .catch(error)
            .finally(() => {
              M2mSpecification.inCloseContribution = false
            })
        }
      }
      contribution.pollCount++
    }
  }
}
