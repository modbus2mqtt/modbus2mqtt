import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core'
import { FormControl, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ImodbusData, Inumber, Iselect, IselectOption } from '@shared/specification'
import { Observable, Subscription } from 'rxjs'
import { ISpecificationMethods, ImodbusEntityWithName } from '../../services/specificationInterface'
import { MatSlideToggle } from '@angular/material/slide-toggle'
import { MatOption } from '@angular/material/core'
import { MatSelect } from '@angular/material/select'
import { MatInput } from '@angular/material/input'
import { MatFormField, MatLabel, MatError } from '@angular/material/form-field'

@Component({
  selector: 'app-entity-value-control',
  templateUrl: './entity-value-control.component.html',
  styleUrl: './entity-value-control.component.css',
  standalone: true,
  imports: [MatFormField, MatLabel, MatInput, FormsModule, ReactiveFormsModule, MatError, MatSelect, MatOption, MatSlideToggle],
})
export class EntityValueControlComponent implements OnInit, OnDestroy, OnChanges {
  @Input({ required: true }) entity: ImodbusEntityWithName | undefined
  @Input({ required: false }) uom: string = ''
  @Input({ required: true }) specificationMethods: ISpecificationMethods | undefined = undefined
  @Input()
  mqttValueObservable: Observable<ImodbusData | undefined> | undefined = undefined
  entityName: string = ''
  sub: Subscription | undefined
  constructor() {}
  step: number | undefined = undefined
  min: number | undefined = undefined
  max: number | undefined = undefined

  optionsFormControl: FormControl<number | null> = new FormControl(null)
  numberFormControl: FormControl<number | null> = new FormControl(null)
  textFormControl: FormControl<string | null> = new FormControl(null)
  toggleFormControl: FormControl<boolean | null> = new FormControl(null)
  onTextChange(_event: Event) {
    if (this.textFormControl.value && this.entity)
      this.specificationMethods &&
        this.specificationMethods.postModbusWriteMqtt(this.entity, this.textFormControl.value.toString()).subscribe((newValue) => {
          this.textFormControl.setValue(newValue)
        })
  }
  onNumberChange() {
    if (this.numberFormControl.value && this.entity)
      this.specificationMethods &&
        this.specificationMethods
          .postModbusWriteMqtt(this.entity, this.numberFormControl.value.toString())
          .subscribe((newValue) => {
            this.textFormControl.setValue(newValue)
          })
  }
  onButton() {
    if (this.toggleFormControl.value && this.entity) {
      const val = this.toggleFormControl.value ? 'ON' : 'OFF'
      this.specificationMethods &&
        this.specificationMethods.postModbusWriteMqtt(this.entity, val).subscribe((newValue) => {
          this.toggleFormControl.setValue(newValue == 'ON')
        })
    }
  }
  onOptionChange() {
    if (this.entity) {
      const option: IselectOption | undefined = (this.entity.converterParameters as Iselect).options!.find(
        (o) => o.key == this.optionsFormControl.value
      )
      if (option && this.entity)
        this.specificationMethods &&
          this.specificationMethods.postModbusWriteMqtt(this.entity, option.name).subscribe((newValue) => {
            const option: IselectOption | undefined = (this.entity!.converterParameters as Iselect).options!.find(
              (o) => o.name == newValue
            )
            if (option) this.optionsFormControl.setValue(option.key)
          })
    }
  }

  ngOnDestroy(): void {
    if (this.sub != undefined) this.sub.unsubscribe()
  }

  isSensor(): boolean {
    return !this.entity || this.entity.readonly
  }
  getConverterName(): string {
    return this.entity && this.entity.converter ? this.entity.converter : 'sensor'
  }
  getMqttValue(): string | number {
    return this.entity && this.entity.mqttValue != undefined ? this.entity.mqttValue : ''
  }
  ngOnChanges(_changes: SimpleChanges): void {
    this.entity2Form()
  }

  entity2Form() {
    if (this.entity) {
      const s = this.entity.name
      this.entityName = s ? s : ''
      let fc: FormControl | undefined = undefined
      switch (this.entity.converter) {
        case 'number':
          if (this.entity.mqttValue != undefined && typeof this.entity.mqttValue == 'number') {
            let decimals = (this.entity.converterParameters as Inumber).decimals
            decimals = decimals && decimals > 0 ? decimals : 2
            this.numberFormControl.setValue(
              parseFloat(Number.parseFloat((this.getMqttValue() as number).toString()).toFixed(decimals))
            )
          }

          const num = this.entity.converterParameters as Inumber
          if (num != undefined) {
            if (num.step) this.step = num.step
            fc = this.numberFormControl
            fc.clearValidators()
            if (num.identification != undefined && num.identification.min) fc.addValidators(Validators.min(num.identification.min))
            if (num.identification != undefined && num.identification.max) fc.addValidators(Validators.max(num.identification.max))
          }
          break
        case 'select':
          if (this.entity.modbusValue)
            if (!this.entity.readonly) {
              this.optionsFormControl.setValue(this.entity.modbusValue[0])
              fc = this.optionsFormControl
            } else {
              this.textFormControl.setValue(this.entity.mqttValue != null ? (this.entity.mqttValue as string) : '')
              fc = this.textFormControl
            }
          break
        case 'text':
          fc = this.textFormControl
          if (this.entity.mqttValue) fc.setValue(this.getMqttValue())
          break
        case 'binary':
          fc = this.toggleFormControl
          if (this.entity.mqttValue) fc.setValue(this.entity.mqttValue == 'ON')
          break
        case 'value':
          // Static value (no modbus address): show the computed mqttValue read-only.
          fc = this.textFormControl
          if (this.entity.mqttValue != undefined) fc.setValue(this.getMqttValue().toString())
          break
      }
      if (fc)
        if (this.entity.readonly) fc.disable()
        else fc.enable()
    }
  }
  ngOnInit(): void {
    this.entity2Form()
    if (this.mqttValueObservable)
      this.sub = this.mqttValueObservable.subscribe((data) => {
        if (this.entity && data) {
          this.entity.modbusValue = data.modbusValue
          this.entity.mqttValue = data.mqttValue
          this.entity.identified = data.identified
          this.entity2Form()
        }
      })
  }
  getUom(): string {
    return this.entity && this.specificationMethods ? this.specificationMethods.getUom(this.entity.id) : ''
  }

  getOptions(): IselectOption[] {
    if (this.entity) {
      const options = (this.entity.converterParameters as Iselect).options
      if (options) return options
    }
    return []
  }
}
