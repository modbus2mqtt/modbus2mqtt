import { describe, it, expect, afterEach } from 'vitest'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { provideRouter } from '@angular/router'
import { Subject } from 'rxjs'
import { EntityComponent } from './entity.component'
import { ISpecificationMethods, ImodbusEntityWithName } from '../../services/specificationInterface'
import {
  IdentifiedStates,
  ImodbusData,
  ImodbusEntity,
  Inumber,
  Iselect,
  Itext,
  ModbusRegisterType,
  VariableTargetParameters,
} from '@shared/specification'
import { ensureAngularTesting } from '../../../test-setup'
import convertersFixture from '../../../test-fixtures/converters.json'

ensureAngularTesting()

function createSpecificationMethods(): ISpecificationMethods {
  return {
    getCurrentMessage: () => ({ type: 0, category: 0 }),
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
    copy2Translation: () => {},
  }
}

function createSelectEntity(): ImodbusEntity {
  return {
    id: 1,
    modbusValue: [4, 1, 1, 1],
    mqttValue: 'ent 4',
    identified: IdentifiedStates.identified,
    converter: 'select',
    readonly: false,
    registerType: 3,
    modbusAddress: 4,
    converterParameters: {} as Iselect,
  }
}

describe('Entity Component tests (vitest)', () => {
  let fixture: ComponentFixture<EntityComponent>
  let component: EntityComponent
  let httpMock: HttpTestingController
  let specMethods: ISpecificationMethods

  async function mount(displayHex = false): Promise<void> {
    ;(window as any).configuration = { rootUrl: '/' }
    specMethods = createSpecificationMethods()

    await TestBed.configureTestingModule({
      imports: [EntityComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents()

    httpMock = TestBed.inject(HttpTestingController)
    fixture = TestBed.createComponent(EntityComponent)
    component = fixture.componentInstance
    component.specificationMethods = specMethods
    component.entity = createSelectEntity()
    component.disabled = false
    component.displayHex = displayHex
    fixture.detectChanges()

    // Flush the converters HTTP request triggered by ngOnInit
    const req = httpMock.expectOne((r) => r.url.includes('converters'))
    req.flush(convertersFixture)
    fixture.detectChanges()

    // Open all expansion panels
    openAllExpansionPanels()
  }

  function openAllExpansionPanels(): void {
    const headers = fixture.nativeElement.querySelectorAll(
      'mat-expansion-panel-header[aria-expanded="false"]'
    ) as NodeListOf<HTMLElement>
    headers.forEach((h) => h.click())
    fixture.detectChanges()
  }

  afterEach(() => {
    httpMock?.verify()
    fixture?.destroy()
  })

  it('Set Variable Type and Entity', async () => {
    await mount()

    // Set variableType to "Unit of Measurement" and trigger the handler
    component.variableFormGroup.get('variableType')!.setValue(VariableTargetParameters.entityUom)
    component.onEntityNameValueChange()
    fixture.detectChanges()

    // Set validation callback before changing variableEntity
    specMethods.copy2Translation = (entity: any) => {
      expect(entity.variableConfiguration).toBeDefined()
      expect(entity.variableConfiguration?.entityId).toBeDefined()
      expect(entity.variableConfiguration?.targetParameter).toBeDefined()
      expect((entity as any).name).toBeUndefined()
    }

    // Set variableEntity to entity with id 4 and trigger the handler
    component.variableFormGroup.get('variableEntity')!.setValue(4)
    component.onVariableEntityValueChange()
    fixture.detectChanges()

    // Name field should be disabled when variable type is set
    const nameInput = fixture.nativeElement.querySelector('input[formControlName="name"]') as HTMLInputElement
    expect(nameInput?.disabled).toBe(true)
  })

  it('No Variable Type => no variableConfiguration', async () => {
    await mount()

    // Set variableType to "no param" (first option = noParam)
    component.variableFormGroup.get('variableType')!.setValue(VariableTargetParameters.noParam)
    fixture.detectChanges()

    // Type a name
    const nameInput = fixture.nativeElement.querySelector('input[formControlName="name"]') as HTMLInputElement
    component.entityFormGroup.get('name')!.setValue('test')
    fixture.detectChanges()

    // Set validation callback
    specMethods.copy2Translation = (entity: any) => {
      const e = entity as ImodbusEntityWithName
      expect(e.variableConfiguration).toBeUndefined()
      expect(e.name).toBe('test')
    }

    // Trigger icon field focus to trigger validation
    const iconInput = fixture.nativeElement.querySelector('input[formControlName="icon"]') as HTMLInputElement
    iconInput?.dispatchEvent(new Event('focus'))
    fixture.detectChanges()

    // variableEntity should not have a value
    const variableEntityValue = component.variableFormGroup.get('variableEntity')!.value
    expect(variableEntityValue).toBeNull()
  })

  it('Set Byte Order for Number', async () => {
    await mount()

    // Set converter to "number" (first converter)
    component.entityFormGroup.get('converter')!.setValue('number')
    fixture.detectChanges()

    // Set postModbusEntity callback to verify swapBytes
    let postCalled = false
    specMethods.postModbusEntity = (entity: any) => {
      postCalled = true
      expect((entity!.converterParameters! as Inumber).swapBytes).toBe(true)
      return new Subject<ImodbusData>()
    }

    // Open expansion panels that may have appeared after converter change
    openAllExpansionPanels()

    // Toggle swapBytes
    component.numberPropertiesFormGroup.get('swapBytes')!.setValue(true)
    fixture.detectChanges()
  })

  it('Set Byte Order for Text', async () => {
    await mount()

    // Set converter to "text" (third converter)
    component.entityFormGroup.get('converter')!.setValue('text')
    fixture.detectChanges()

    // Set postModbusEntity callback to verify swapBytes
    let postCalled = false
    specMethods.postModbusEntity = (entity: any) => {
      postCalled = true
      expect((entity!.converterParameters! as Itext).swapBytes).toBeDefined()
      expect((entity!.converterParameters! as Itext).swapBytes).toBe(true)
      return new Subject<ImodbusData>()
    }

    // Open expansion panels that may have appeared after converter change
    openAllExpansionPanels()

    // Toggle textSwapBytes
    component.stringPropertiesFormGroup.get('textSwapBytes')!.setValue(true)
    fixture.detectChanges()
  })

  it('correctly handles entity with modbusAddress 0', async () => {
    const entity = createSelectEntity()
    entity.modbusAddress = 0
    entity.name = 'zero address entity'
    entity.mqttname = 'zero_address'

    ;(window as any).configuration = { rootUrl: '/' }
    specMethods = createSpecificationMethods()

    await TestBed.configureTestingModule({
      imports: [EntityComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents()

    httpMock = TestBed.inject(HttpTestingController)
    fixture = TestBed.createComponent(EntityComponent)
    component = fixture.componentInstance
    component.specificationMethods = specMethods
    component.entity = entity
    component.disabled = false
    component.displayHex = false
    fixture.detectChanges()

    const req = httpMock.expectOne((r) => r.url.includes('converters'))
    req.flush(convertersFixture)
    fixture.detectChanges()

    expect(component.entityFormGroup.get('modbusAddress')!.value).toBe('0')
    expect(component.entityFormGroup.get('modbusAddress')!.valid).toBe(true)
    expect(component.entityFormGroup.valid).toBe(true)
  })

  it('handles Coil entity writeFC5 toggle and disabled state when readonly', async () => {
    const entity = createSelectEntity()
    entity.registerType = ModbusRegisterType.Coils
    entity.name = 'coil entity'
    entity.mqttname = 'coil_entity'
    entity.readonly = false
    entity.writeFunctionCode = 5

    ;(window as any).configuration = { rootUrl: '/' }
    specMethods = createSpecificationMethods()

    await TestBed.configureTestingModule({
      imports: [EntityComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents()

    httpMock = TestBed.inject(HttpTestingController)
    fixture = TestBed.createComponent(EntityComponent)
    component = fixture.componentInstance
    component.specificationMethods = specMethods
    component.entity = entity
    component.disabled = false
    component.displayHex = false
    fixture.detectChanges()

    const req = httpMock.expectOne((r) => r.url.includes('converters'))
    req.flush(convertersFixture)
    fixture.detectChanges()

    // Should recognize entity as Coil
    expect(component.isCoil()).toBe(true)
    // Form control should be initialized to true because writeFunctionCode is 5
    expect(component.entityFormGroup.get('writeFC5')!.value).toBe(true)

    // Turning writeFC5 off should remove writeFunctionCode (default FC15)
    component.entityFormGroup.get('writeFC5')!.setValue(false)
    component.form2Entity()
    expect(component.entity.writeFunctionCode).toBeUndefined()

    // Turning writeFC5 on should set writeFunctionCode to 5
    component.entityFormGroup.get('writeFC5')!.setValue(true)
    component.form2Entity()
    expect(component.entity.writeFunctionCode).toBe(5)

    // When readonly is set, the coil is readonly and writeFC5 should be disabled
    component.entityFormGroup.get('readonly')!.setValue(true)
    component.form2Entity()
    expect(component.entityFormGroup.get('readonly')?.value).toBe(true)
    expect(component.entityFormGroup.get('writeFC5')?.disabled).toBe(true)

    // When readonly is cleared, writeFC5 should be enabled
    component.entityFormGroup.get('readonly')!.setValue(false)
    component.form2Entity()
    expect(component.entityFormGroup.get('writeFC5')?.disabled).toBe(false)
  })
})


