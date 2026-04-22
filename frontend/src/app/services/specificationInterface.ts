import { Ientity, Imessage, ImodbusData, ImodbusEntity, VariableTargetParameters } from '@shared/specification'
import { Observable } from 'rxjs'
export interface ImodbusEntityWithName extends ImodbusEntity {
  name?: string
  valid?: boolean
}
export interface ISpecificationMethods {
  setEntitiesTouched(): void
  postModbusEntity(changedEntity: ImodbusEntityWithName): Observable<ImodbusData>
  postModbusWriteMqtt(entity: ImodbusEntity, value: string): Observable<string>
  getNonVariableNumberEntities(): { id: number; name: string }[]
  getMqttNames(entityId: number): string[]
  getCurrentMessage(): Imessage | undefined
  hasDuplicateVariableConfigurations(entityId: number, targetParameter: VariableTargetParameters): boolean
  canEditEntity(): boolean
  getMqttLanguageName(): string
  getUom(entity_id: number): string
  addEntity(addedEntity: ImodbusEntityWithName): void
  deleteEntity(entityId: number): void
  copy2Translation(entity: Ientity): void
  getSaveObservable(): Observable<void>
}
export function isDeviceVariable(variableTarget: VariableTargetParameters): boolean {
  return [
    VariableTargetParameters.deviceIdentifiers,
    VariableTargetParameters.deviceSWversion,
    VariableTargetParameters.deviceSerialNumber,
    VariableTargetParameters.deviceHWversion,
  ].includes(variableTarget)
}
