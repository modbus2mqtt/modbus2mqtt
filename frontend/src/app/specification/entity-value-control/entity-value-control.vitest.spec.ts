import { describe, it, expect, beforeEach } from 'vitest'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { provideRouter } from '@angular/router'
import { Observable, of, Subject } from 'rxjs'
import { EntityValueControlComponent } from './entity-value-control.component'
import { ISpecificationMethods } from '../../services/specificationInterface'
import { IdentifiedStates, ImodbusData, ImodbusEntity, Inumber, Iselect, ModbusRegisterType } from '@shared/specification'
import { ensureAngularTesting } from '../../../test-setup'

ensureAngularTesting()

function createSpecificationMethods(postSpy?: (entity: ImodbusEntity, val: string) => void): ISpecificationMethods {
  return {
    getCurrentMessage: () => ({ type: 0, category: 0 }),
    getMqttLanguageName: () => 'english',
    getUom: () => 'W',
    getNonVariableNumberEntities: () => [],
    getMqttNames: () => [],
    getSaveObservable: () => new Subject<void>(),
    postModbusEntity: () => new Subject<ImodbusData>(),
    postModbusWriteMqtt: (entity: ImodbusEntity, value: string): Observable<string> => {
      if (postSpy) postSpy(entity, value)
      return of(value)
    },
    hasDuplicateVariableConfigurations: () => false,
    canEditEntity: () => true,
    setEntitiesTouched: () => {},
    addEntity: () => {},
    deleteEntity: () => {},
    copy2Translation: () => {},
  }
}

describe('EntityValueControlComponent (vitest)', () => {
  let fixture: ComponentFixture<EntityValueControlComponent>
  let component: EntityValueControlComponent

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EntityValueControlComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents()
  })

  it('handles binary/coil entity live write to ON and OFF', () => {
    let lastWrittenValue = ''
    const specMethods = createSpecificationMethods((_entity, val) => {
      lastWrittenValue = val
    })

    const entity: ImodbusEntity = {
      id: 1,
      name: 'switch 1',
      mqttname: 'switch_1',
      converter: 'binary',
      registerType: ModbusRegisterType.Coils,
      modbusAddress: 1,
      readonly: false,
      mqttValue: 'OFF',
      identified: IdentifiedStates.identified,
    }

    fixture = TestBed.createComponent(EntityValueControlComponent)
    component = fixture.componentInstance
    component.entity = entity
    component.specificationMethods = specMethods
    fixture.detectChanges()

    // Initially toggle should be false (OFF)
    expect(component.toggleFormControl.value).toBe(false)

    // Toggle to ON
    component.toggleFormControl.setValue(true)
    component.onButton()
    expect(lastWrittenValue).toBe('ON')
    expect(component.toggleFormControl.value).toBe(true)

    // Toggle to OFF
    component.toggleFormControl.setValue(false)
    component.onButton()
    expect(lastWrittenValue).toBe('OFF')
    expect(component.toggleFormControl.value).toBe(false)
  })

  it('handles number entity live write', () => {
    let lastWrittenValue = ''
    const specMethods = createSpecificationMethods((_entity, val) => {
      lastWrittenValue = val
    })

    const entity: ImodbusEntity = {
      id: 2,
      name: 'standby time window',
      mqttname: 'standby_time_window',
      converter: 'number',
      converterParameters: { multiplier: 1, offset: 0, decimals: 0 } as Inumber,
      registerType: ModbusRegisterType.HoldingRegister,
      modbusAddress: 3,
      readonly: false,
      mqttValue: 255,
      identified: IdentifiedStates.identified,
    }

    fixture = TestBed.createComponent(EntityValueControlComponent)
    component = fixture.componentInstance
    component.entity = entity
    component.specificationMethods = specMethods
    fixture.detectChanges()

    expect(component.numberFormControl.value).toBe(255)

    // Change number value
    component.numberFormControl.setValue(120)
    component.onNumberChange()
    expect(lastWrittenValue).toBe('120')
  })

  it('handles select entity live write', () => {
    let lastWrittenValue = ''
    const specMethods = createSpecificationMethods((_entity, val) => {
      lastWrittenValue = val
    })

    const entity: ImodbusEntity = {
      id: 3,
      name: 'mode select',
      mqttname: 'mode_select',
      converter: 'select',
      converterParameters: {
        options: [
          { key: 0, name: 'Auto' },
          { key: 1, name: 'Manual' },
        ],
      } as Iselect,
      registerType: ModbusRegisterType.HoldingRegister,
      modbusAddress: 4,
      readonly: false,
      modbusValue: [0],
      mqttValue: 'Auto',
      identified: IdentifiedStates.identified,
    }

    fixture = TestBed.createComponent(EntityValueControlComponent)
    component = fixture.componentInstance
    component.entity = entity
    component.specificationMethods = specMethods
    fixture.detectChanges()

    expect(component.optionsFormControl.value).toBe(0)

    // Change option to Manual (key 1)
    component.optionsFormControl.setValue(1)
    component.onOptionChange()
    expect(lastWrittenValue).toBe('Manual')
  })
})
