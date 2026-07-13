import { FormBuilder } from '@angular/forms'
import { Subject, of } from 'rxjs'
import { describe, it, expect, vi } from 'vitest'

import { EntityComponent } from './entity.component'
import { ISpecificationMethods, ImodbusEntityWithName } from '../../services/specificationInterface'
import {
  Converters,
  IdentifiedStates,
  ImodbusData,
  Inumber,
  Iselect,
  Itext,
  ModbusRegisterType,
  VariableTargetParameters,
} from '@shared/specification'

class ApiServiceMock {
  getConverters() {
    return of(['number', 'text', 'select'] as Converters[])
  }
}

const baseEntity: ImodbusEntityWithName = {
  id: 1,
  modbusValue: [4, 1, 1, 1],
  mqttValue: 'ent 4',
  identified: IdentifiedStates.identified,
  converter: 'select',
  readonly: false,
  registerType: ModbusRegisterType.HoldingRegister,
  modbusAddress: 4,
  converterParameters: {} as Iselect,
}

const buildSpecificationMethods = () => {
  const copySpy = vi.fn()
  const methods: ISpecificationMethods = {
    getCurrentMessage: () => ({ type: 0, category: 0 }) as any,
    getMqttLanguageName: () => 'english',
    getUom: () => 'cm',
    getNonVariableNumberEntities: () => [{ id: 4, name: 'ent 4' }],
    getMqttNames: () => [],
    getSaveObservable: () => new Subject<void>(),
    postModbusEntity: () => new Subject<ImodbusData>(),
    postModbusWriteMqtt: () => new Subject<string>(),
    hasDuplicateVariableConfigurations: () => false,
    canEditEntity: () => true,
    setEntitiesTouched: () => {},
    addEntity: () => {},
    deleteEntity: () => {},
    copy2Translation: (entity) => copySpy(entity),
  }
  return { methods, copySpy }
}

const createComponent = (methods: ISpecificationMethods, entity: ImodbusEntityWithName) => {
  const component = new EntityComponent(new ApiServiceMock() as any, new FormBuilder())
  component.specificationMethods = methods
  component.entity = entity
  component.disabled = false
  component.displayHex = false
  component.ngOnInit()
  return component
}

describe('EntityComponent (vitest)', () => {
  it('Set Variable Type and Entity', () => {
    const { methods, copySpy } = buildSpecificationMethods()
    const component = createComponent(methods, structuredClone(baseEntity))

    component.variableFormGroup.get('variableType')!.setValue(VariableTargetParameters.entityUom)
    component.variableFormGroup.get('variableEntity')!.setValue(4)
    component.onVariableEntityValueChange()

    expect(component.entity.variableConfiguration).toBeDefined()
    expect(component.entity.variableConfiguration?.targetParameter).toBe(VariableTargetParameters.entityUom)
    expect(component.entity.variableConfiguration?.entityId).toBe(4)
    expect(component.entity.name).toBeUndefined()
    expect(component.entityFormGroup.get('name')?.disabled).toBe(true)
    expect(copySpy).toHaveBeenCalled()
  })

  it('No Variable Type => no variableConfiguration', () => {
    const { methods } = buildSpecificationMethods()
    const component = createComponent(methods, structuredClone(baseEntity))

    component.variableFormGroup.get('variableType')!.setValue(VariableTargetParameters.noParam)
    component.variableFormGroup.get('variableEntity')!.setValue(null)
    component.entityFormGroup.get('name')!.setValue('test')
    component.onEntityNameValueChange()

    expect(component.entity.variableConfiguration).toBeUndefined()
    expect(component.entity.name).toBe('test')
    expect(component.variableFormGroup.get('variableEntity')!.value).toBeNull()
  })

  it('Set Byte Order for Number', () => {
    const { methods } = buildSpecificationMethods()
    const component = createComponent(methods, {
      ...structuredClone(baseEntity),
      converter: 'number',
      converterParameters: {} as Inumber,
    })

    component.entityFormGroup.get('converter')!.setValue('number')
    component.numberPropertiesFormGroup.get('swapBytes')!.setValue(true)
    component.onConverterValueChange()

    expect((component.entity.converterParameters as Inumber).swapBytes).toBe(true)
  })

  it('Set Byte Order for Text', () => {
    const { methods } = buildSpecificationMethods()
    const component = createComponent(methods, {
      ...structuredClone(baseEntity),
      converter: 'text',
      converterParameters: {} as Itext,
    })

    component.entityFormGroup.get('converter')!.setValue('text')
    component.stringPropertiesFormGroup.get('stringlength')!.setValue(5)
    component.stringPropertiesFormGroup.get('textSwapBytes')!.setValue(true)
    component.onConverterValueChange()

    expect((component.entity.converterParameters as Itext).swapBytes).toBe(true)
  })
})
