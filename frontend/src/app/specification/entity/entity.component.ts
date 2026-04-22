import { AfterViewInit, Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core'

import { ApiService } from '../../services/api-service'
import { HexFormaterDirective } from '../hexinputfield/hexinputfield'

import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms'
import { Observable, Subject, Subscription } from 'rxjs'
import {
  Converters,
  EnumNumberFormat,
  EnumStateClasses,
  IFunctionCode as IRegisterType,
  IdentifiedStates,
  Ientity,
  ImodbusData,
  ImodbusEntity,
  Iname,
  Inumber,
  Iselect,
  IselectOption,
  Itext,
  ModbusRegisterType,
  VariableTargetParameters,
  getFileNameFromName,
  getParameterType,
} from '@shared/specification'
import { SessionStorage } from '../../services/SessionStorage'
import { M2mErrorStateMatcher } from '../../services/M2mErrorStateMatcher'
import { ISpecificationMethods, ImodbusEntityWithName, isDeviceVariable } from '../../services/specificationInterface'
import { CdkDragDrop, moveItemInArray, CdkDropList, CdkDrag } from '@angular/cdk/drag-drop'
import { MatOption } from '@angular/material/core'
import { MatSelect } from '@angular/material/select'
import { MatSlideToggle } from '@angular/material/slide-toggle'
import { MatInput } from '@angular/material/input'
import { MatFormField, MatLabel, MatError } from '@angular/material/form-field'
import { MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle } from '@angular/material/expansion'
import { EntityValueControlComponent } from '../entity-value-control/entity-value-control.component'
import { MatIcon } from '@angular/material/icon'
import { MatTooltip } from '@angular/material/tooltip'
import { MatIconButton } from '@angular/material/button'
import { NgClass, AsyncPipe } from '@angular/common';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card'

const nameFormControlName = 'name'

const optionModbusFormControlName = 'optionModbus'
const optionMqttFormControlName = 'optionMqtt'
const variableTypeFormControlName = 'variableType'
const variableEntityFormControlName = 'variableEntity'
const mqttNameFormControlName = 'mqttname'
interface IdeviceClass {
  name: string
  defaultuom?: string
  uom?: string[]
}
const newEntity: ImodbusEntityWithName = {
  name: '',
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  modbusValue: [0],
  mqttValue: '',
  identified: IdentifiedStates.unknown,
  converter: 'number',
  modbusAddress: 0,
  id: -1,
}

@Component({
  selector: 'app-entity',
  templateUrl: './entity.component.html',
  styleUrl: './entity.component.css',
  standalone: true,
  imports: [
    HexFormaterDirective,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatIconButton,
    MatTooltip,
    MatIcon,
    NgClass,
    EntityValueControlComponent,
    MatCardContent,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatError,
    MatSlideToggle,
    MatSelect,
    MatOption,
    CdkDropList,
    CdkDrag,
    AsyncPipe
],
})
export class EntityComponent extends SessionStorage implements AfterViewInit, OnChanges, OnDestroy {
  onMqttValueChange(_event: any, _entity: ImodbusEntity) {
    _event.target.value = 'YYYY'
  }
  onMqttKeyPress($event: KeyboardEvent) {
    if (
      !('a' <= $event.key && $event.key <= 'z') &&
      !('A' <= $event.key && $event.key <= 'Z') &&
      !('0' <= $event.key && $event.key <= '9')
    ) {
      $event.stopImmediatePropagation()
      return false
    }
    return true
  }
  variableTypes: { id: VariableTargetParameters; name: string }[] = [
    { id: VariableTargetParameters.noParam, name: '' },
    {
      id: VariableTargetParameters.deviceIdentifiers,
      name: 'Identification for Discovery',
    },
    { id: VariableTargetParameters.deviceSerialNumber, name: 'Serial Number' },
    { id: VariableTargetParameters.deviceSWversion, name: 'Software Version' },
    { id: VariableTargetParameters.deviceHWversion, name: 'Hardware Version' },
    { id: VariableTargetParameters.entityMultiplier, name: 'Multiplier' },
    { id: VariableTargetParameters.entityOffset, name: 'Offset' },
    { id: VariableTargetParameters.entityUom, name: 'Unit of Measurement' },
  ]
  @Input({ required: true })
  specificationMethods: ISpecificationMethods | undefined = undefined

  @Input()
  entity: ImodbusEntityWithName = structuredClone(newEntity)
  backupEntity: ImodbusEntityWithName | null = null
  @Input()
  disabled: boolean = true
  @Input()
  displayHex: boolean = false
  entityCategories: string[] = ['', 'config', 'diagnostic']

  mqttValues: HTMLElement | undefined = undefined
  converters: Observable<Converters[]> | null = null
  currentLanguage: string | null = null
  mqttValueObservable: Subject<ImodbusData | undefined> = new Subject<ImodbusData | undefined>()
  specificationSavedObservable: Observable<void> | undefined = undefined
  subSpec: Subscription | undefined = undefined
  allFormGroups: FormGroup
  entityFormGroup: FormGroup
  variableFormGroup: FormGroup
  selectPropertiesFormGroup: FormGroup
  numberPropertiesFormGroup: FormGroup
  stringPropertiesFormGroup: FormGroup
  registerTypes: IRegisterType[] = [
    {
      registerType: ModbusRegisterType.HoldingRegister,
      name: 'Holding Registers',
    },
    { registerType: ModbusRegisterType.AnalogInputs, name: 'Analog Input' },
    { registerType: ModbusRegisterType.Coils, name: 'Coils' },
    {
      registerType: ModbusRegisterType.DiscreteInputs,
      name: 'Discrete Inputs',
    },
  ]

  entitiesDisplayedColumns = ['select', nameFormControlName, 'identified', 'mqttValue', 'action']

  constructor(
    private entityApiService: ApiService,
    private fb: FormBuilder
  ) {
    super()
    this.allFormGroups = this.fb.group({})
    this.entityFormGroup = this.fb.group({
      name: [null as string | null, this.entityNameValidator.bind(this)],
      mqttname: [null as string | null, this.entityMqttNameValidator.bind(this)],
      converter: [null as Converters | null, Validators.required],
      modbusAddress: [
        null as number | null,
        Validators.compose([
          Validators.required,
          Validators.min(0),
          Validators.max(65536),
          Validators.pattern('^0[xX][0-9a-fA-F]+$|^[0-9]+$'),
        ]),
      ],
      registerType: [null as IRegisterType | null, Validators.required],
      readonly: [null as boolean | null],
      entityCategory: [''],
      icon: [null as string | null],
      forceUpdate: [false],
      value_template: [null as string | null],
    })
    this.variableFormGroup = this.fb.group({
      variableType: [null as VariableTargetParameters | null],
      variableEntity: [null as ImodbusEntity | null, this.variableEntityValidator.bind(this)],
    })
    ;((this.numberPropertiesFormGroup = this.fb.group({
      deviceClass: [null as string | null],
      stateClass: [null as EnumStateClasses | null],
      multiplier: [1, Validators.required],
      offset: [0, Validators.required],
      decimals: [2],
      numberFormat: [EnumNumberFormat.default, Validators.required],
      uom: [null as string | null],
      min: [null as string | null],
      max: [null as string | null],
      step: [null as string | null, Validators.compose([Validators.min(0.001), Validators.max(10000)])],
      swapBytes: [false],
      swapWords: [false],
    })),
      (this.stringPropertiesFormGroup = this.fb.group({
        identExpr: [null as string | null],
        stringlength: [null as number | null, Validators.required],
        textSwapBytes: [false],
      })),
      (this.selectPropertiesFormGroup = this.fb.group({
        optionModbus: [null as number | null, Validators.compose([Validators.required, this.uniqueKeyValidator.bind(this)])],
        optionMqtt: [null as string | null, Validators.compose([Validators.required, this.uniqueNameValidator.bind(this)])],
        deviceClass: [null as string | null],
      })))
  }

  ngOnInit(): void {
    this.generateEntityCopyToForm()
    if (this.specificationMethods) {
      this.specificationSavedObservable = this.specificationMethods.getSaveObservable()
      this.subSpec = this.specificationSavedObservable.subscribe(() => {
        this.backupEntity = null
        this.allFormGroups.markAsPristine()
      })
    }

    this.allFormGroups.setControl('entity', this.entityFormGroup)
    this.allFormGroups.setControl('variable', this.variableFormGroup)
  }

  ngOnDestroy(): void {
    if (this.subSpec) this.subSpec.unsubscribe()
  }

  ngAfterViewInit() {
    this.converters = this.entityApiService.getConverters()
  }

  private generateEntityCopyToForm() {
    if (this.entity) this.backupEntity = structuredClone(this.entity)
    else {
      this.backupEntity = null
      this.entity = structuredClone(this.entity)
    }
    this.copyEntityToForm(this.entity!)
  }

  ngOnChanges(_changes: SimpleChanges) {
    this.generateEntityCopyToForm()
  }
  private findUom(dc: IdeviceClass | undefined, uom: string | undefined): string | undefined {
    if (dc && dc.uom && dc.defaultuom && (!uom || !dc.uom.includes(uom))) return dc.defaultuom
    return uom
  }
  getDeviceClass(deviceClassName: string | undefined): IdeviceClass | undefined {
    return EntityComponent.deviceClassesSensor.find((dc) => dc.name == deviceClassName)
  }
  deviceClassHasUoms(): boolean {
    if (!this.numberPropertiesFormGroup || !this.numberPropertiesFormGroup.get('deviceClass')) return false
    const dc = this.numberPropertiesFormGroup.get('deviceClass')!.value
    if (dc && dc.uom) return true
    return false
  }
  private isVariableType() {
    const vt = this.variableFormGroup.get(variableTypeFormControlName)!.value
    return vt && vt != 0 && Number.parseInt(vt.value) != 0
  }
  private enableEntityFieldsVariableType() {
    const disableVtFields: { form: AbstractControl; value: any }[] = [
      { form: this.entityFormGroup.get('name')!, value: null },
      { form: this.entityFormGroup.get(mqttNameFormControlName)!, value: null },
      { form: this.entityFormGroup.get('icon')!, value: null },
      { form: this.entityFormGroup.get('forceUpdate')!, value: false },
      { form: this.entityFormGroup.get('entityCategory')!, value: null },
      { form: this.entityFormGroup.get('readonly')!, value: true },
    ]
    if (this.isVariableType()) {
      disableVtFields.forEach((f) => {
        f.form.disable()
        f.form.setValue(f.value)
      })
      if (isDeviceVariable(this.variableFormGroup.get(variableTypeFormControlName)!.value))
        this.variableFormGroup.get(variableEntityFormControlName)!.disable()
      else this.variableFormGroup.get(variableEntityFormControlName)!.enable()
    } else {
      disableVtFields.forEach((f) => f.form.enable())
      this.variableFormGroup.get(variableEntityFormControlName)!.setValue(null)
      this.variableFormGroup.get(variableEntityFormControlName)!.disable()
    }
    this.entityFormGroup.updateValueAndValidity()
    this.variableFormGroup.updateValueAndValidity()
  }
  private copyEntityToForm(entity: ImodbusEntityWithName) {
    if (!this.entityFormGroup) return
    const converterFormControl = this.entityFormGroup.get('converter')!
    const modbusAddressFormControl = this.entityFormGroup.get('modbusAddress')!

    if (this.disabled) {
      this.entityFormGroup.disable()
      this.numberPropertiesFormGroup.disable()
      this.stringPropertiesFormGroup.disable()
      this.variableFormGroup.disable()
      this.selectPropertiesFormGroup.disable()
    } else {
      this.entityFormGroup.enable()
      this.numberPropertiesFormGroup.enable()
      this.stringPropertiesFormGroup.enable()
      this.variableFormGroup.enable()
      this.selectPropertiesFormGroup.enable()
      this.entityFormGroup.get(mqttNameFormControlName)?.setErrors(null)
      this.enableEntityFieldsVariableType()
    }
    this.variableFormGroup
      .get(variableTypeFormControlName)!
      .setValue(entity.variableConfiguration ? entity.variableConfiguration.targetParameter : null)
    this.variableFormGroup
      .get(variableEntityFormControlName)!
      .setValue(
        entity.variableConfiguration && entity.variableConfiguration.entityId ? entity.variableConfiguration.entityId : null
      )
    if (
      this.variableFormGroup.get(variableTypeFormControlName)!.value == null ||
      this.variableFormGroup.get(variableTypeFormControlName)!.value == 0
    ) {
      // This entity is no variable
      this.entityFormGroup.get(nameFormControlName)!.setValue(entity.name)
      if (entity.mqttname) this.entityFormGroup.get(mqttNameFormControlName)!.setValue(entity.mqttname)
      else if (this.entityFormGroup.get(mqttNameFormControlName)!.value != null)
        this.entityFormGroup
          .get(mqttNameFormControlName)!
          .setValue(getFileNameFromName(this.entityFormGroup.get(nameFormControlName)!.value))
      this.entityFormGroup.get('icon')!.setValue(entity.icon)
      this.entityFormGroup.get('forceUpdate')!.setValue(entity.forceUpdate)
      this.entityFormGroup.get('value_template')!.setValue(entity.value_template)
      this.entityFormGroup.get('entityCategory')!.setValue(entity.entityCategory)
      this.entityFormGroup.get('readonly')!.setValue(entity.readonly)
    }

    this.entityFormGroup.get('registerType')!.setValue({ registerType: entity.registerType, name: 'unknown' })
    converterFormControl.setValue(entity.converter)
    modbusAddressFormControl.setValue(
      entity.modbusAddress != undefined ? HexFormaterDirective.convertNumberToInput(entity.modbusAddress, this.displayHex) : null
    )

    if (converterFormControl.value !== entity.converter || modbusAddressFormControl.value !== entity.modbusAddress) {
      converterFormControl.setValue(entity.converter !== undefined ? entity.converter : null)
      modbusAddressFormControl.setValue(
        entity.modbusAddress && entity.modbusAddress != -1
          ? HexFormaterDirective.convertNumberToInput(entity.modbusAddress, this.displayHex)!
          : null
      )
    }

    if (!entity.converterParameters) {
      entity.converterParameters = {}
    }
    const converterParameters = entity.converterParameters
    switch (this.getParameterTypeFromConverterFormControl()) {
      case 'Inumber':
        this.allFormGroups.setControl('properties', this.numberPropertiesFormGroup)

        const np = converterParameters as Inumber
        this.numberPropertiesFormGroup.get('multiplier')!.setValue(np.multiplier ? np.multiplier : 1)
        this.numberPropertiesFormGroup.get('offset')!.setValue(np.offset ? np.offset : 0)
        this.numberPropertiesFormGroup.get('decimals')!.setValue(np.decimals != undefined ? np.decimals : -1)
        const dc = this.getDeviceClass(np.device_class)
        this.numberPropertiesFormGroup.get('deviceClass')!.setValue(dc ? dc : null)
        np.uom = this.findUom(dc, np.uom)
        this.numberPropertiesFormGroup.get('uom')!.setValue(np.uom ? np.uom : null)
        this.numberPropertiesFormGroup.get('stateClass')!.setValue(np.state_class ? np.state_class : null)
        this.numberPropertiesFormGroup
          .get('numberFormat')!
          .setValue(np.numberFormat !== undefined ? np.numberFormat : EnumNumberFormat.default)
        this.numberPropertiesFormGroup.get('swapBytes')!.setValue(np.swapBytes !== undefined ? np.swapBytes : false)
        this.numberPropertiesFormGroup.get('swapWords')!.setValue(np.swapWords !== undefined ? np.swapWords : false)
        this.numberPropertiesFormGroup
          .get('min')!
          .setValue(np.identification && np.identification.min !== undefined ? np.identification.min : null)
        if (!entity.readonly)
          this.numberPropertiesFormGroup.get('step')!.setValue(np.step && np.step !== undefined ? np.step : null)
        this.numberPropertiesFormGroup
          .get('max')!
          .setValue(np.identification && np.identification.max !== undefined ? np.identification.max : null)
        break
      case 'Itext':
        this.allFormGroups.setControl('properties', this.stringPropertiesFormGroup)
        const nt = converterParameters as Itext
        this.stringPropertiesFormGroup.get('stringlength')!.setValue(nt.stringlength ? nt.stringlength : 10)
        this.stringPropertiesFormGroup.get('identExpr')!.setValue(nt.identification ? nt.identification : null)
        this.stringPropertiesFormGroup.get('textSwapBytes')!.setValue(nt.swapBytes !== undefined ? nt.swapBytes : false)
        break
      case 'Iselect':
        this.allFormGroups.setControl('properties', this.selectPropertiesFormGroup)
        //(this.selectedEntity.converterParameters as Iselect).options = (converterParameters as Iselect).options;
        switch (converterFormControl.value) {
          case 'button':
          case 'binary_sensor':
            // default options for binary sensor
            const nb = converterParameters as Iselect
            nb.options = [
              { key: 0, name: 'ON' },
              { key: 1, name: 'OFF' },
            ]
            this.selectPropertiesFormGroup.get('deviceClass')!.setValue(nb.device_class ? nb.device_class : null)
            break
          default:
        }
    }
    this.entity.valid = this.canSaveEntity()
  }

  getParameterTypeFromConverterFormControl(): string | undefined {
    const converterFormControl = this.entityFormGroup.get('converter')!
    return getParameterType(converterFormControl.value)
  }

  getCurrentOptions(): IselectOption[] {
    if (this.entity && this.entity.converterParameters && (this.entity.converterParameters as Iselect).options)
      return (this.entity.converterParameters as Iselect).options!
    return []
  }
  getValueTemplate(): string {
    return this.entity.value_template ? this.entity.value_template : '{{ value_json.' + this.entity.mqttname + '}}'
  }
  isTouched(): boolean {
    if (!this.entityFormGroup.pristine) return true
    if (!this.variableFormGroup!.pristine) return true
    switch (this.getParameterTypeFromConverterFormControl()) {
      case 'Iselect':
        if (!this.backupEntity) return true
        const eo = JSON.stringify((this.entity.converterParameters as Iselect).options)
        const bo = JSON.stringify((this.backupEntity.converterParameters as Iselect).options)
        return eo != bo

      case 'Itext':
        return !this.stringPropertiesFormGroup.pristine
      case 'Inumber':
        return !this.numberPropertiesFormGroup.pristine
      default:
        return false
    }
  }
  readFromModbus() {
    if (this.specificationMethods)
      this.specificationMethods.postModbusEntity(this.entity).subscribe((data) => {
        this.mqttValueObservable.next(data)
      })
  }
  isCurrentMessage(): boolean {
    if (this.specificationMethods == undefined) return false
    return this.specificationMethods.getCurrentMessage()?.referencedEntity == this.entity.id
  }
  onVariableEntityValueChange() {
    if (this.specificationMethods) this.specificationMethods.setEntitiesTouched()
    const variableType = this.variableFormGroup.get(variableTypeFormControlName)!.value
    if (variableType)
      this.entity.variableConfiguration = {
        targetParameter: variableType,
        entityId:
          this.variableFormGroup.get(variableEntityFormControlName)!.value == null
            ? undefined
            : this.variableFormGroup.get(variableEntityFormControlName)!.value,
      }
    else if (this.entity.variableConfiguration) delete this.entity.variableConfiguration
    this.entity.name = undefined
    this.enableEntityFieldsVariableType()
    if (this.specificationMethods) this.specificationMethods.copy2Translation(this.entity)
  }
  onEntityNameValueChange() {
    // set mqtt name in form control,
    // read variable configuration and set values accordingly.
    // No impact on modbus values
    // set entity.name, entity.mqttname and entity.variableConfiguration
    if (!this.entity || !this.specificationMethods) return

    this.specificationMethods.setEntitiesTouched()
    if (this.isVariableType()) this.onVariableEntityValueChange()
    else {
      delete this.entity.variableConfiguration
      this.onVariableEntityValueChange()
      if (
        this.entityFormGroup.get(nameFormControlName)!.value != null &&
        this.entityFormGroup.get(nameFormControlName)!.value != 'N/A'
      ) {
        this.entity.name = this.entityFormGroup.get(nameFormControlName)!.value
      }

      const mqttname: string | undefined | null = this.entityFormGroup.get(mqttNameFormControlName)!.value
      if (mqttname && mqttname.length > 0) this.entity.mqttname = mqttname.toLowerCase()
      else if (this.entity.name) this.entity.mqttname = getFileNameFromName(this.entity.name)

      this.entityFormGroup.get(mqttNameFormControlName)!.setValue(this.entity.mqttname != null ? this.entity.mqttname : null)
      this.enableEntityFieldsVariableType()
      this.specificationMethods.copy2Translation(this.entity)
    }
  }
  onModbusAddressKeyPress(event: KeyboardEvent) {
    const allowed = '0123456789xXABCDEFabcdef'
    return allowed.indexOf(event.key) >= 0
  }
  onModbusAddressChange() {
    if (!this.entity || !this.specificationMethods) return
    this.specificationMethods.setEntitiesTouched()
    const modbusAddressFormControl = this.entityFormGroup.get('modbusAddress')!
    const converterFormControl = this.entityFormGroup.get('converter')!

    if (
      (modbusAddressFormControl.value != null && modbusAddressFormControl.value !== this.entity.modbusAddress) ||
      (converterFormControl.value != null && converterFormControl.value !== this.entity.converter)
    ) {
      if (modbusAddressFormControl.value != null)
        this.entity.modbusAddress = HexFormaterDirective.convertHexInput(modbusAddressFormControl.value)!
      if (converterFormControl.value !== null) {
        this.entity.converter = converterFormControl.value as Converters
      }
    }
    this.entity.registerType =
      this.entityFormGroup.get('registerType')!.value != null
        ? this.entityFormGroup.get('registerType')!.value.registerType
        : (this.entity.registerType = ModbusRegisterType.HoldingRegister)

    if (this.entity.registerType == ModbusRegisterType.AnalogInputs) {
      this.entityFormGroup.get('registerType')
      this.entity.readonly = true
      this.entityFormGroup.get('readonly')?.disable()
      this.entityFormGroup.get('readonly')?.setValue(true)
    } else {
      this.entityFormGroup.get('readonly')?.enable()
    }
    this.entity.readonly = true
    this.readFromModbus()
  }
  isAnalogInput(): boolean {
    return this.entity.registerType == ModbusRegisterType.AnalogInputs
  }
  form2Entity() {
    // copies all values which are not relevant to
    // this.saveButton.disabled = !this.canSaveEntity(entity)
    if (!this.entity || !this.specificationMethods) return
    this.specificationMethods.setEntitiesTouched()
    if (this.entityFormGroup.get('icon')!.value != null) this.entity.icon = this.entityFormGroup.get('icon')!.value
    if (this.entityFormGroup.get('forceUpdate')!.value != null)
      this.entity.forceUpdate = this.entityFormGroup.get('forceUpdate')!.value
    if (this.entityFormGroup.get('value_template')!.value != null)
      this.entity.value_template = this.entityFormGroup.get('value_template')!.value
    if (this.entityFormGroup.get('readonly')!.value != null) this.entity.readonly = this.entityFormGroup.get('readonly')!.value
    if (this.entityFormGroup.get('entityCategory')!.value != null && this.entityFormGroup.get('entityCategory')!.value.length > 0)
      this.entity.entityCategory = this.entityFormGroup.get('entityCategory')!.value
    else delete this.entity.entityCategory
    switch (this.getParameterTypeFromConverterFormControl()) {
      case 'Inumber':
        break
    }
    this.setEntitiesTouched()
  }
  onConverterValueChange() {
    this.onConverterValueChangeLocal()
    this.readFromModbus()
  }
  updateReadonly() {
    const category = this.entityFormGroup.get('entityCategory')!.value
    switch (category) {
      case 'diagnostic':
        this.entityFormGroup.get('readonly')!.setValue(true)
        break
      case 'config':
        this.entityFormGroup.get('readonly')!.setValue(false)
        break
      default:
        break
    }
  }
  updateCategory() {
    let category = this.entityFormGroup.get('entityCategory')!.value
    if (category && category.length) {
      category = this.entityFormGroup.get('readonly')!.value ? 'diagnostic' : 'config'
      this.entityFormGroup.get('entityCategory')!.setValue(category)
    }
  }

  private onConverterValueChangeLocal() {
    this.specificationMethods && this.specificationMethods.setEntitiesTouched()
    switch (this.getParameterTypeFromConverterFormControl()) {
      case 'Inumber':
        this.allFormGroups.setControl('properties', this.numberPropertiesFormGroup)
        this.entity.converterParameters = {}
        const enumber: Inumber = this.entity.converterParameters as Inumber
        if (this.numberPropertiesFormGroup.get('multiplier')!.value != null)
          enumber.multiplier = this.numberPropertiesFormGroup.get('multiplier')!.value
        else enumber.multiplier = 1

        if (this.numberPropertiesFormGroup.get('offset')!.value != null)
          enumber.offset = this.numberPropertiesFormGroup.get('offset')!.value
        else enumber.offset = 0
        if (this.numberPropertiesFormGroup.get('decimals')!.value != null)
          enumber.decimals = this.numberPropertiesFormGroup.get('decimals')!.value
        else enumber.decimals = 2
        if (this.numberPropertiesFormGroup.get('numberFormat')!.value != null)
          enumber.numberFormat = this.numberPropertiesFormGroup.get('numberFormat')!.value
        const min = this.numberPropertiesFormGroup.get('min')!.value
        const max = this.numberPropertiesFormGroup.get('max')!.value
        if (!this.entity.readonly) {
          const val = this.numberPropertiesFormGroup.get('step')!.value
          if (val) enumber.step = Number.parseFloat(val)
        }
        if (min !== null && max !== null) {
          enumber.identification = {
            min: min,
            max: max,
          }
        }
        if (this.numberPropertiesFormGroup.get('numberFormat')!.value in [EnumNumberFormat.default, EnumNumberFormat.signedInt16])
          this.numberPropertiesFormGroup.get('swapWords')!.disable()
        else this.numberPropertiesFormGroup.get('swapWords')!.enable()
        if (this.numberPropertiesFormGroup.get('swapWords')!.value != undefined)
          enumber.swapWords = this.numberPropertiesFormGroup.get('swapWords')!.value
        if (this.numberPropertiesFormGroup.get('swapBytes')!.value != undefined)
          enumber.swapBytes = this.numberPropertiesFormGroup.get('swapBytes')!.value
        if (this.numberPropertiesFormGroup.get('deviceClass')!.value != null)
          enumber.device_class = this.numberPropertiesFormGroup.get('deviceClass')!.value.name
        if (this.numberPropertiesFormGroup.get('stateClass')!.value != null)
          enumber.state_class = this.numberPropertiesFormGroup.get('stateClass')!.value
        // If there is a device class with a set of uoms, make sure, the uom is in the set
        const dc = EntityComponent.deviceClassesSensor.find((dc) => dc.name == enumber.device_class)
        const uomField =
          this.numberPropertiesFormGroup.get('uom')!.value != null ? this.numberPropertiesFormGroup.get('uom')!.value : undefined
        const uom = this.findUom(dc, uomField)
        if (uom) {
          enumber.uom = uom
          this.numberPropertiesFormGroup.get('uom')!.setValue(uom ? uom : null)
        }

        break
      case 'Itext':
        this.allFormGroups.setControl('properties', this.stringPropertiesFormGroup)
        this.entity.converterParameters = {}
        const strlenFormControl = this.stringPropertiesFormGroup.get('stringlength')
        if (strlenFormControl && strlenFormControl.value != null)
          (this.entity.converterParameters as any).stringlength = strlenFormControl.value
        if (this.stringPropertiesFormGroup.get('identExpr')! !== null) {
          ;(this.entity.converterParameters as any).identification = this.stringPropertiesFormGroup.get('identExpr')!.value

          if (this.stringPropertiesFormGroup.get('textSwapBytes')! !== null)
            (this.entity.converterParameters as Itext).swapBytes = this.stringPropertiesFormGroup.get('textSwapBytes')!.value
        }
        break
      case 'Iselect':
        this.allFormGroups.setControl('properties', this.selectPropertiesFormGroup)
        if (!this.entity.converterParameters) this.entity.converterParameters = { options: [] }
        break
    }
  }

  onSaveEntity() {
    this.form2Entity()
    if (this.entity) {
      delete (this.entity as any)['isNew']
      this.onConverterValueChange()
    }
  }
  canSaveEntity(): boolean {
    if (!this.entity) return false

    const entityFormGroup = this.entityFormGroup!
    let parameterValid = false
    switch (this.getParameterTypeFromConverterFormControl()) {
      case 'Inumber':
        parameterValid = this.numberPropertiesFormGroup.valid
        break
      case 'Iselect':
        if (this.entity && this.entity.converterParameters && (this.entity.converterParameters as Iselect).options)
          parameterValid = (this.entity.converterParameters as Iselect)!.options!.length > 0
        break
      case 'Itext':
        parameterValid = this.stringPropertiesFormGroup.valid
        break
      default:
        parameterValid = true
    }
    return parameterValid && entityFormGroup.valid && this.variableFormGroup.valid
  }

  restoreEntity(): void {
    if (this.backupEntity) {
      this.entity = this.backupEntity
      this.copyEntityToForm(this.entity)
      this.entityFormGroup.markAsPristine()
    } else {
      this.entity = newEntity
    }
  }

  addEntity() {
    this.specificationMethods && this.specificationMethods.addEntity(this.entity)
    this.entity = structuredClone(newEntity)
    this.copyEntityToForm(this.entity)
  }

  isNewEntity(entity: Ientity): boolean {
    return entity.id == -1
  }

  copyEntity() {
    this.specificationMethods && this.specificationMethods.addEntity(this.entity)
  }
  nameListCompare = (o1: any, o2: any) => {
    return o1.name === o2.name
  }

  private isUniqueEntityName(cmparray: Iname[], inp: FormControl<string | null>, list?: FormControl<Iname[] | null>) {
    const found = cmparray.find((val) => {
      return (
        val.name === inp.value &&
        (list === null ||
          list === undefined ||
          -1 ==
            (list as FormControl<Iname[]>).value.findIndex((v) => {
              return v.name === inp.value
            }))
      )
    })
    if (found) return false
    return true
  }

  private uniqueNameValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    {
      return this.entity.converter != 'select' || undefined == this.getCurrentOptions().find((opt) => opt.name == control.value)
        ? null
        : { unique: control.value }
    }
  }

  private uniqueKeyValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    {
      return undefined == this.getCurrentOptions().find((opt) => opt.key == control.value) ? null : { unique: control.value }
    }
  }

  private entityNameValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    if (this.variableFormGroup) {
      return this.isVariableType() || (control.value != null && control.value.length > 0) ? null : { required: control.value }
    }

    return { invalid: control.value }
  }

  private entityMqttNameValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    if (this.variableFormGroup && this.entity && this.specificationMethods) {
      const found = this.specificationMethods.getMqttNames(this.entity.id).find((mqttname) => mqttname && mqttname == control.value)
      if (found) {
        return { unique: control.value }
      }
      return (this.entity && this.isVariableType()) || (control.value != null && control.value.length > 0)
        ? null
        : { required: control.value }
    }

    return { invalid: control.value }
  }

  selectOptionsValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    {
      return (this.entity?.converterParameters as Iselect).options &&
        (this.entity?.converterParameters as Iselect).options!.length > 0
        ? null
        : { empty: control.value }
    }
  }

  variableEntityValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    if (!this.variableFormGroup) return null
    const vt = this.variableFormGroup.get(variableTypeFormControlName)!

    // variables for devices don't need entity
    if (isDeviceVariable(vt.value)) return null

    if (control == null || control.value == null || control.value == 0) return { invalid: control.value }

    return this.specificationMethods && this.specificationMethods.hasDuplicateVariableConfigurations(control.value.id, vt.value)
      ? { unique: control.value }
      : null
  }

  errorStateMatcher = new M2mErrorStateMatcher()

  getIdentifiedIcon(ent: Ientity): string {
    switch ((ent as ImodbusEntity).identified) {
      case IdentifiedStates.identified:
        return 'check'
      case IdentifiedStates.notIdentified:
        return 'cancel'
      default:
        return ''
    }
  }
  getIdentifiedText(ent: Ientity): string {
    switch ((ent as ImodbusEntity).identified) {
      case IdentifiedStates.identified:
        return 'modbus value matches with configuration'
      case IdentifiedStates.notIdentified:
        return 'modbus value does NOT match with configuration'
      default:
        return ''
    }
  }

  isConverterSelected() {
    return this.entityFormGroup.get('converter')!.value != null
  }
  getMqttValue(rc: ImodbusEntity): string {
    if (rc)
      if (rc.converter === 'number' && rc.mqttValue != undefined) {
        return (rc.mqttValue as number).toString()
      } else return rc.mqttValue as string
    return 'N/A'
  }

  getModbusValue(rc: ImodbusEntity): string {
    if (rc && rc.modbusValue) return rc.modbusValue.toString()
    return 'N/A'
  }

  getDeviceClasses(): { name: string; uom?: string[] }[] {
    if (this.getParameterTypeFromConverterFormControl())
      return this.getParameterTypeFromConverterFormControl() === 'Ibinary_sensor' ||
        this.getParameterTypeFromConverterFormControl() === 'Iselect'
        ? EntityComponent.deviceClassesBinarySensor
        : EntityComponent.deviceClassesSensor
    else return []
  }

  compareFunctionCodes(f1: IRegisterType, f2: IRegisterType) {
    return f1 && f2 && f1.registerType == f2.registerType
  }

  compareNumber(f1: number, f2: number) {
    return f1 == f2
  }
  compareName(f1: { name: string }, f2: { name: string }) {
    return f1 && f2 && f1.name == f2.name
  }

  compareEntities(f1: Ientity, f2: Ientity) {
    return f1 && f2 && f1.id == f2.id
  }
  getEntityLabel(): string {
    if (!this.entity.name && this.isVariableType() && this.specificationMethods) {
      if (!isDeviceVariable(this.entity.variableConfiguration!.targetParameter)) {
        const e = this.specificationMethods
          .getNonVariableNumberEntities()
          .find((e) => e.id == this.entity.variableConfiguration!.entityId)
        return e ? '=>' + e.name : ''
      }
    }
    return ''
  }
  getNonVariableNumberEntities(): { id: number; name: string }[] {
    return [{ id: 4, name: 'ent 4' }]
    //return this.specificationMethods.getNonVariableNumberEntities()
  }
  xxx = [{ id: 4, name: 'ent 4' }]
  getVariableTypeOrEntityNameLabel(): string {
    if (this.entity.name) return this.entity.name
    else if (this.isVariableType()) {
      const type = this.variableTypes.find((e) => e.id == this.entity.variableConfiguration!.targetParameter)
      return type ? type.name : ''
    }
    return ''
  }

  addOption() {
    if (this.canAddOption() && this.specificationMethods) {
      this.specificationMethods.setEntitiesTouched()
      const selectPropertiesForm = this.selectPropertiesFormGroup
      if (this.selectPropertiesFormGroup.valid && this.entity) {
        if ((this.entity.converterParameters as Iselect).options == undefined)
          (this.entity.converterParameters as Iselect).options = []

        const modbusValue: number | undefined = selectPropertiesForm.get(optionModbusFormControlName)!.value
        if (modbusValue != undefined && modbusValue != null) {
          const idx = (this.entity.converterParameters as Iselect).options!.findIndex((o) => o.key > modbusValue!)
          if (idx >= 0)
            (this.entity.converterParameters as Iselect).options!.splice(idx, 0, {
              key: modbusValue,
              name: selectPropertiesForm.get(optionMqttFormControlName)!.value,
            })
          else
            (this.entity.converterParameters as Iselect).options!.push({
              key: modbusValue,
              name: selectPropertiesForm.get(optionMqttFormControlName)!.value,
            })

          this.readFromModbus()
        }
        this.entity = structuredClone(this.entity)
      }
    }
  }
  setEntitiesTouched() {
    this.specificationMethods && this.specificationMethods.setEntitiesTouched()
  }
  dropOptions(event: CdkDragDrop<any, any, any>) {
    moveItemInArray((this.entity.converterParameters as Iselect).options!, event.previousIndex, event.currentIndex)
    this.specificationMethods && this.specificationMethods.setEntitiesTouched()
  }

  canAddOption() {
    this.selectPropertiesFormGroup.get(['optionModbus'])?.updateValueAndValidity()
    this.selectPropertiesFormGroup.get(['optionMqtt'])?.updateValueAndValidity()
    return this.selectPropertiesFormGroup.valid
  }
  deleteOption(option: IselectOption) {
    this.specificationMethods && this.specificationMethods.setEntitiesTouched()
    // delete name
    const idx = this.getCurrentOptions().findIndex((opt) => opt.key == option.key)
    if (idx >= 0) this.getCurrentOptions().splice(idx, 1)
    if (this.entity) {
      if (this.entity.modbusValue[0] == option.key) this.readFromModbus()
      else {
        this.copyEntityToForm(this.entity)
      }
      this.allFormGroups.markAsDirty()
    }
  }
  static deviceClassesBinarySensor: [
    { name: 'None' },
    { name: 'connectivity' },
    { name: 'power' },
    { name: 'problem' },
    { name: 'running' },
    { name: 'safety' },
    { name: 'update' },
  ]

  static deviceClassesSensor: IdeviceClass[] = [
    { name: 'None' },
    { name: 'apparent_power', defaultuom: 'VA', uom: ['VA'] },
    {
      name: 'atmospheric_pressure',
      defaultuom: 'mbar',
      uom: ['cbar', 'bar', 'hPa', 'mmHg', 'inHg', 'kPa', 'mbar', 'Pa', 'psi'],
    },
    { name: 'current', defaultuom: 'A', uom: ['A', 'mA'] },
    {
      name: 'data_rate',
      defaultuom: 'MB/s',
      uom: ['bit/s', 'kbit/s', 'Mbit/s', 'Gbit/s', 'B/s', 'kB/s', 'MB/s', 'GB/s', 'KiB/s', 'MiB/s', 'GiB/s'],
    },
    {
      name: 'data_size',
      defaultuom: 'GB',
      uom: ['bit', 'kbit', 'Mbit', 'Gbit', 'B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'],
    },
    { name: 'date' },
    {
      name: 'distance',
      defaultuom: 'm',
      uom: ['km', 'm', 'cm', 'mm', 'mi', 'nmi', 'yd', 'in'],
    },
    { name: 'duration', defaultuom: 's', uom: ['d', 'h', 'min', 's', 'ms'] },
    {
      name: 'energy',
      defaultuom: 'kWh',
      uom: ['J', 'kJ', 'MJ', 'GJ', 'Wh', 'kWh', 'MWh', 'cal', 'kcal', 'Mcal', 'Gcal'],
    },
    {
      name: 'energy_storage',
      defaultuom: 'kWh',
      uom: ['J', 'kJ', 'MJ', 'GJ', 'Wh', 'kWh', 'MWh', 'cal', 'kcal', 'Mcal', 'Gcal'],
    },
    { name: 'enum' },
    { name: 'frequency', defaultuom: 'Hz', uom: ['Hz', 'kHz', 'MHz', 'GHz'] },
    { name: 'gas', defaultuom: 'm³', uom: ['m³', 'ft³', 'CCF'] },
    { name: 'humidity', defaultuom: '%', uom: ['%'] },
    { name: 'pm1', defaultuom: 'µg/m³', uom: ['µg/m³'] },
    { name: 'pm25', defaultuom: 'µg/m³', uom: ['µg/m³'] },
    { name: 'pm10', defaultuom: 'µg/m³', uom: ['µg/m³'] },
    { name: 'power_factor', defaultuom: '%³', uom: ['%'] },
    { name: 'power', defaultuom: 'W', uom: ['W', 'kW'] },
    { name: 'precipitation', defaultuom: 'cm', uom: ['cm', 'mm'] },
    {
      name: 'precipitation_intensity',
      defaultuom: 'mm/h',
      uom: ['in/d', 'in/h', 'mm/d', 'mm/h'],
    },
    {
      name: 'pressure',
      defaultuom: 'mbar',
      uom: ['Pa', 'kPa', 'hPa', 'bar', 'cbar', 'mbar', 'mmHg', 'inHg', 'psi'],
    },
    { name: 'reactive_power', defaultuom: 'var', uom: ['var'] },
    { name: 'signal_strength', defaultuom: 'bB', uom: ['dB', 'dBm'] },
    {
      name: 'speed',
      defaultuom: 'm/s',
      uom: ['ft/s', 'in/d', 'in/h', 'in/s', 'km/h', 'kn', 'm/s', 'mph', 'mm/d', 'mm/s'],
    },
    { name: 'temperature', defaultuom: '°C', uom: ['°C', '°F', 'K'] },
    { name: 'timestamp' },
    { name: 'voltage', defaultuom: 'V', uom: ['V', 'mV'] },
    {
      name: 'volume',
      defaultuom: 'm³',
      uom: ['L', 'mL', 'gal', 'fl. oz.', 'm³', 'ft³', 'CCF'],
    },
    {
      name: 'volume_storage',
      defaultuom: 'm³',
      uom: ['L', 'mL', 'gal', 'fl. oz.', 'm³', 'ft³', 'CCF'],
    },
    { name: 'water', defaultuom: 'm³', uom: ['L', 'gal', 'm³', 'ft³', 'CCF'] },
    {
      name: 'weight',
      defaultuom: 'kg',
      uom: ['kg', 'g', 'mg', 'µg', 'oz', 'lb', 'st'],
    },
  ]
}
