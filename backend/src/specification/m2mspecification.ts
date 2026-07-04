import { IspecificationValidator, IvalidateIdentificationResult } from './ispecificationvalidator.js'
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
import { getNextCheck, ghContributions, msToTime, startPolling } from './contributionPoller.js'
import { getEntityFromId, getMultiplier, getOffset, getPropertyFromVariable } from './entityAccessors.js'
import { compareSpecifications, isEqualValue } from './specDiff.js'
import { validateBaseSpecification, validateFiles, validateSpecification, validateUniqueName } from './specValidator.js'
import { Observable } from 'rxjs'
import { IpullRequest } from './m2mGithubValidate.js'

const log = new Logger('m2mSpecification')
export class M2mSpecification implements IspecificationValidator {
  private differentFilename = false
  private notBackwardCompatible = false

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
  static getFileUsage(url: string): SpecificationFileUsage {
    const name = url.toLowerCase()
    if (name.endsWith('.pdf')) return SpecificationFileUsage.documentation
    if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.bmp'))
      return SpecificationFileUsage.img
    return SpecificationFileUsage.documentation
  }
  getUom(entityId: number): string | undefined {
    const rc = getPropertyFromVariable((this.settings as ImodbusSpecification).entities, entityId, VariableTargetParameters.entityUom)
    if (rc) return rc as string | undefined
    const ent = getEntityFromId((this.settings as ImodbusSpecification).entities, entityId)
    if (!ent || !ent.converterParameters || !(ent.converterParameters as Inumber).uom) return undefined
    return (ent.converterParameters as Inumber).uom
  }
  getMultiplier(entityId: number): number | undefined {
    return getMultiplier((this.settings as ImodbusSpecification).entities, entityId)
  }
  getOffset(entityId: number): number | undefined {
    return getOffset((this.settings as ImodbusSpecification).entities, entityId)
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
  /** kept as static alias so tests and routes can keep using M2mSpecification['ghContributions'] */
  private static ghContributions = ghContributions

  static startPolling(specfilename: string, error: (e: unknown) => void): Observable<IpullRequest> | undefined {
    return startPolling(specfilename, error)
  }
  static getNextCheck(specfilename: string): string {
    return getNextCheck(specfilename)
  }
  static msToTime(ms: number): string {
    return msToTime(ms)
  }
}
