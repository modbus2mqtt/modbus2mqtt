import { IspecificationValidator, IvalidateIdentificationResult } from './ispecificationvalidator.js'
import Debug from 'debug'
import { Idata, IfileSpecification } from './ifilespecification.js'
import { Imessage, VariableTargetParameters } from '../shared/specification/index.js'
import {
  Ispecification,
  IbaseSpecification,
  SpecificationStatus,
  getSpecificationI18nName,
  ImodbusSpecification,
  SpecificationFileUsage,
  IdentifiedStates,
  ImodbusEntity,
  Inumber,
} from '../shared/specification/index.js'
import { ConfigSpecification } from './configspec.js'
import { LogLevelEnum, Logger } from './log.js'
import {
  IModbusResultOrError,
  ImodbusValues,
  copyFromTestData,
  copyModbusDataToEntity,
  emptyModbusValues,
  fileToModbusSpecification,
} from './modbusValues.js'
import { getMessageString, messages2Text } from './specMessages.js'
import { closeContribution, contribute, getSpecificationsFilesList } from './contribution.js'
import { compareSpecifications, isEqualValue } from './specDiff.js'
import { validateBaseSpecification, validateFiles, validateSpecification, validateUniqueName } from './specValidator.js'
import { Observable, Subject } from 'rxjs'
import { IpullRequest } from './m2mGithubValidate.js'

const log = new Logger('m2mSpecification')
const debug = Debug('m2mspecification')
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
    return messages2Text(spec, msgs)
  }
  async contribute(note: string | undefined): Promise<number> {
    return contribute(this.settings as Ispecification, note)
  }

  static getMessageString(spec: IbaseSpecification, message: Imessage): string {
    return getMessageString(spec, message)
  }
  static closeContribution(spec: IfileSpecification): Promise<IpullRequest> {
    return closeContribution(spec)
  }
  getSpecificationsFilesList(localDir: string): string[] {
    return getSpecificationsFilesList(this.settings as IbaseSpecification, localDir)
  }

  validate(language: string): Imessage[] {
    return validateSpecification(this.settings as Ispecification, language)
  }

  validateUniqueName(language: string): boolean {
    return validateUniqueName(this.settings as IbaseSpecification, language)
  }
  static fileToModbusSpecification(inSpec: IfileSpecification, values?: ImodbusValues): ImodbusSpecification {
    return fileToModbusSpecification(inSpec, values)
  }

  static copyModbusDataToEntity(spec: Ispecification, entityId: number, values: ImodbusValues): ImodbusEntity {
    return copyModbusDataToEntity(spec, entityId, values)
  }

  validateIdentification(language: string): IvalidateIdentificationResult[] {
    const identifiedSpecs: IvalidateIdentificationResult[] = []
    const values = emptyModbusValues()
    let fSettings: IfileSpecification
    if ((this.settings as IfileSpecification).testdata) fSettings = this.settings as IfileSpecification
    else fSettings = ConfigSpecification.toFileSpecification(this.settings as ImodbusSpecification)
    if (fSettings.testdata.holdingRegisters)
      copyFromTestData(fSettings.testdata.holdingRegisters, values.holdingRegisters)
    if (fSettings.testdata.analogInputs) copyFromTestData(fSettings.testdata.analogInputs, values.analogInputs)
    if (fSettings.testdata.coils) copyFromTestData(fSettings.testdata.coils, values.coils)
    if (fSettings.testdata.discreteInputs)
      copyFromTestData(fSettings.testdata.discreteInputs, values.discreteInputs)
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
    return isEqualValue(v1, v2)
  }
  isEqual(other: Ispecification): Imessage[] {
    return compareSpecifications(this.settings as ImodbusSpecification, other)
  }

  validateFiles(msgs: Imessage[]) {
    validateFiles(this.settings as IbaseSpecification, msgs)
  }
  validateSpecification(language: string, forContribution: boolean = false): Imessage[] {
    return validateBaseSpecification(this.settings as ImodbusSpecification, language, forContribution)
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
