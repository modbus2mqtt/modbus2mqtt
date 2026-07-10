import { IfileSpecification } from './ifilespecification.js'
import { Imessage } from '../shared/specification/index.js'
import {
  Ispecification,
  IbaseSpecification,
  SpecificationStatus,
  ImodbusSpecification,
  IdentifiedStates,
  ImodbusEntity,
} from '../shared/specification/index.js'
import { ImodbusValues, copyModbusDataToEntity, fileToModbusSpecification } from './modbusValues.js'
import { getMessageString, messages2Text } from './specMessages.js'
import { closeContribution, contribute, getSpecificationsFilesList } from './contribution.js'
import { getNextCheck, ghContributions, msToTime, startPolling } from './contributionPoller.js'
import { getMultiplier, getOffset } from './entityAccessors.js'
import { compareSpecifications, isEqualValue } from './specDiff.js'
import { validateBaseSpecification, validateFiles, validateSpecification, validateUniqueName } from './specValidator.js'
import { Observable } from 'rxjs'
import { IpullRequest } from './m2mGithubValidate.js'

/**
 * Facade over the specification layer modules (modbusValues, specValidator,
 * specMessages, specDiff, contribution, contributionPoller, entityAccessors).
 * Kept for the published @modbus2mqtt/specification API and the m2m-validate CLI;
 * new code should prefer the module functions directly.
 */
export class M2mSpecification {
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
  static getMessageString(spec: IbaseSpecification, message: Imessage): string {
    return getMessageString(spec, message)
  }
  async contribute(note: string | undefined): Promise<number> {
    return contribute(this.settings as Ispecification, note)
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
  validateFiles(msgs: Imessage[]) {
    validateFiles(this.settings as IbaseSpecification, msgs)
  }
  validateSpecification(language: string, forContribution: boolean = false): Imessage[] {
    return validateBaseSpecification(this.settings as ImodbusSpecification, language, forContribution)
  }

  static fileToModbusSpecification(inSpec: IfileSpecification, values?: ImodbusValues): ImodbusSpecification {
    return fileToModbusSpecification(inSpec, values)
  }
  static copyModbusDataToEntity(spec: Ispecification, entityId: number, values: ImodbusValues): ImodbusEntity {
    return copyModbusDataToEntity(spec, entityId, values)
  }

  getMultiplier(entityId: number): number | undefined {
    return getMultiplier((this.settings as ImodbusSpecification).entities, entityId)
  }
  getOffset(entityId: number): number | undefined {
    return getOffset((this.settings as ImodbusSpecification).entities, entityId)
  }

  isEqualValue(v1: unknown, v2: unknown): boolean {
    return isEqualValue(v1, v2)
  }
  isEqual(other: Ispecification): Imessage[] {
    return compareSpecifications(this.settings as ImodbusSpecification, other)
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
