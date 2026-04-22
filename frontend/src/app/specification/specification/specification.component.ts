import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output, ViewEncapsulation } from '@angular/core'
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ApiService } from '../../services/api-service'
import { Observable, Subject, Subscription, map } from 'rxjs'
import {
  ImodbusSpecification,
  IbaseSpecification,
  getSpecificationI18nName,
  getFileNameFromName,
  IdentifiedStates,
  SpecificationStatus,
  setSpecificationI18nName,
  IimageAndDocumentUrl,
  ImodbusEntity,
  newSpecification,
  getParameterType,
  VariableTargetParameters,
  setSpecificationI18nEntityOptionName,
  setSpecificationI18nEntityName,
  Iselect,
  deleteSpecificationI18nEntityNameAndOptions,
  IUpdatei18nText,
  ImodbusData,
  Ispecification,
  getBaseFilename,
} from '@shared/specification'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { SessionStorage } from '../../services/SessionStorage'
import { Imessage, getUom } from '@shared/specification'
import { GalleryConfig } from 'ng-gallery'
import { ISpecificationMethods, ImodbusEntityWithName } from '../../services/specificationInterface'
import { I18nService } from '../../services/i18n.service'
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { SpecificationServices } from '../../services/specificationServices'
import { Iconfiguration } from '@shared/server'
import { EntityComponent } from '../entity/entity.component'
import { TranslationComponent } from '../translation/translation.component'
import { MatInput } from '@angular/material/input'
import { MatFormField, MatLabel } from '@angular/material/form-field'
import { UploadFilesComponent } from '../upload-files/upload-files.component'
import { MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle } from '@angular/material/expansion'
import { MatList, MatListItem } from '@angular/material/list'
import { MatSlideToggle, MatSlideToggleChange } from '@angular/material/slide-toggle'
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card'

import { MatIcon } from '@angular/material/icon'
import { MatTooltip } from '@angular/material/tooltip'
import { MatIconButton } from '@angular/material/button'

@Component({
  selector: 'app-specification',
  templateUrl: './specification.component.html',
  styleUrls: ['./specification.component.css'],
  encapsulation: ViewEncapsulation.None,
  standalone: true,
  imports: [
    MatIconButton,
    MatTooltip,
    MatIcon,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    MatList,
    MatListItem,
    RouterLink,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    UploadFilesComponent,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    TranslationComponent,
    EntityComponent,
    MatSlideToggle
],
})
export class SpecificationComponent extends SessionStorage implements OnInit, OnDestroy {
  slaveid: number | undefined = undefined
  busId: number | undefined = undefined

  // @Output()
  // updateSpecificationEvent= new EventEmitter<IidentificationSpecification>();

  @Output()
  nextEmitter = new EventEmitter<void>()
  currentSpecification: ImodbusSpecification | null = null
  originalSpecification: ImodbusSpecification | null = null
  displayHexFormGroup: FormGroup<any>
  displayHex: boolean = false
  galleryConfig: GalleryConfig = { thumbs: false }
  private entitiesTouched: boolean = false
  private saveSubject = new Subject<void>()
  private i18nTouched: boolean = false
  private filesTouched: boolean = false
  private specServices: SpecificationServices | undefined
  private currentMessage: Imessage | undefined
  disabled: boolean = false
  specificationMethods: ISpecificationMethods | undefined
  entities: ImodbusEntityWithName[] | undefined
  config: Iconfiguration | undefined
  sub: Subscription | undefined = undefined
  validationMessages: Imessage[] = []
  errorMessages = new Set<string>()
  specificationSubject: Subject<ImodbusSpecification> | undefined = undefined //Seems not to be used new Subject<ImodbusSpecification>();
  enterSpecNameFormGroup: FormGroup
  validationForms: FormGroup
  constructor(
    private entityApiService: ApiService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router
  ) {
    super()
    this.enterSpecNameFormGroup = this.fb.group({
      name: [null as string | null, Validators.required],
      filename: [null as string | null],
      icon: [null as string | null],
      manufacturer: [null as string | null],
      model: [null as string | null],
    })
    this.displayHexFormGroup = this.fb.group({
      displayHex: [false],
    })
    this.validationForms = this.fb.group({ spec: this.enterSpecNameFormGroup })
  }
  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe()
  }
  private getMqttDiscoveryLanguage(): string {
    if (this.config) return this.config.mqttdiscoverylanguage
    return 'en'
  }

  private setCurrentSpecification(spec: Ispecification | null) {
    this.currentMessage = undefined
    this.currentSpecification = (spec ? spec : null) as ImodbusSpecification
    this.entities = this.currentSpecification == null ? undefined : (this.currentSpecification.entities as ImodbusEntityWithName[])
    if (this.entities && this.currentSpecification && this.config) {
      I18nService.specificationTextsFromTranslation(this.currentSpecification!, this.getMqttDiscoveryLanguage())
    }
    this.specificationMethods = {
      copy2Translation: (entity: ImodbusEntityWithName): void => {
        if (entity && entity.id >= 0 && this.currentSpecification && this.config) {
          setSpecificationI18nEntityName(this.currentSpecification, this.getMqttDiscoveryLanguage(), entity.id, entity.name)
          if (entity.converterParameters && (entity.converterParameters as Iselect).options)
            (entity.converterParameters as Iselect).options?.forEach((option) => {
              setSpecificationI18nEntityOptionName(
                this.currentSpecification as IbaseSpecification,
                this.config!.mqttdiscoverylanguage,
                entity.id,
                option.key,
                option.name
              )
            })
          this.setValidationMessages()
          //TODO this.setErrorMessages();
          if (this.specificationSubject) this.specificationSubject.next(this.currentSpecification)
        }
      },
      setEntitiesTouched: (): void => {
        this.entitiesTouched = true
        this.setValidationMessages()
      },

      getMqttLanguageName: () => {
        if (!this.config) return ''
        return I18nService.getLanguageName(this.getMqttDiscoveryLanguage())
      },
      getUom: (entity_id: number): string => {
        return getUom(this.currentSpecification as ImodbusSpecification, entity_id)
      },
      postModbusEntity: (changedEntity: ImodbusEntityWithName): Observable<ImodbusData> => {
        if (this.currentSpecification && this.config && this.busId != undefined && this.slaveid != undefined) {
          const lSpec: ImodbusSpecification = structuredClone(this.currentSpecification)
          const entity: ImodbusEntityWithName = structuredClone(changedEntity)
          I18nService.specificationTextsToTranslation(lSpec, this.getMqttDiscoveryLanguage(), entity)
          const idx = lSpec.entities.findIndex((e) => e.id == entity.id)
          if (idx >= 0) lSpec.entities[idx] = entity
          else lSpec.entities.push(entity)
          return this.entityApiService
            .postModbusEntity(lSpec, changedEntity, this.busId, this.slaveid, this.getMqttDiscoveryLanguage())
            .pipe(
              map((e) => {
                this.setValidationMessages()
                return {
                  id: e.id,
                  modbusValue: e.modbusValue,
                  mqttValue: e.mqttValue,
                  identified: e.identified,
                } as ImodbusData
              })
            )
        } else throw new Error('specification is undefined') // should not happen
      },

      postModbusWriteMqtt: (entity, value) => {
        if (this.busId == undefined || this.slaveid == undefined || !this.currentSpecification || !this.config)
          throw new Error('undefined parameter') // should not happen
        const s = structuredClone(this.currentSpecification!)
        const idx = s.entities.findIndex((e) => e.id == entity.id)
        if (idx >= 0) s.entities[idx] = entity
        else s.entities.push(entity)
        return this.entityApiService
          .postModbusWriteMqtt(s, entity.id, this.busId, this.slaveid, this.getMqttDiscoveryLanguage(), value)
          .pipe(
            map((v) => {
              this.setValidationMessages()
              return v
            })
          )
      },
      getNonVariableNumberEntities: () => {
        const rc: { id: number; name: string }[] = []
        if (this.currentSpecification)
          this.currentSpecification.entities.forEach((e) => {
            if (
              (e.variableConfiguration == undefined || e.variableConfiguration.targetParameter == null) &&
              getParameterType(e.converter) == 'Inumber'
            ) {
              const d = (e as ImodbusEntityWithName).name
              rc.push({ id: e.id, name: d ? d : '' })
            }
          })
        return rc
      },
      getMqttNames: (entityId) => {
        const rc: string[] = []
        if (this.currentSpecification)
          this.currentSpecification.entities.forEach((ent) => {
            if (ent.mqttname && ent.mqttname && ent.id != entityId) rc.push(ent.mqttname)
          })
        return rc
      },
      hasDuplicateVariableConfigurations: (entityId: number, targetParameter: VariableTargetParameters): boolean => {
        let count = 0
        {
          switch (targetParameter) {
            case VariableTargetParameters.deviceIdentifiers:
            case VariableTargetParameters.deviceSerialNumber:
            case VariableTargetParameters.deviceSWversion:
            case VariableTargetParameters.deviceHWversion:
              return false
            default:
              if (this.currentSpecification)
                this.currentSpecification.entities.forEach((ent) => {
                  if (
                    ent.variableConfiguration != null &&
                    ent.variableConfiguration.targetParameter != null &&
                    ent.variableConfiguration.targetParameter == targetParameter &&
                    ent.variableConfiguration.entityId == entityId &&
                    entityId != targetParameter
                  )
                    count++
                })
              return count >= 2
          }
        }
      },
      canEditEntity: () => {
        if (!this.currentSpecification) return false
        return !(this.currentSpecification.status in [SpecificationStatus.published, SpecificationStatus.contributed])
      },
      addEntity: (addedEntity: ImodbusEntityWithName): void => {
        if (this.currentSpecification) {
          this.entitiesTouched = true
          let maxId = 1
          this.currentSpecification.entities.forEach((e) => {
            if (e.id > maxId) maxId = e.id
          })
          if (!this.currentSpecification.nextEntityId || maxId + 1 > this.currentSpecification.nextEntityId)
            this.currentSpecification.nextEntityId = maxId + 1

          const newEntity = structuredClone(addedEntity)

          newEntity.id = this.currentSpecification.nextEntityId++

          if (addedEntity.id >= 0) {
            const index = this.currentSpecification.entities.findIndex((e) => e.id == addedEntity.id)
            newEntity.mqttname = undefined
            newEntity.name = undefined
            const insertAfterIndex = index < this.currentSpecification.entities.length ? index + 1 : index
            this.currentSpecification.entities.splice(insertAfterIndex, 0, newEntity)
            this.entities = this.currentSpecification.entities
          } else {
            this.currentSpecification.entities.push(newEntity)
            this.updateTranslation(newEntity)
          }
          this.setValidationMessages()
          if (this.specificationSubject) this.specificationSubject.next(this.currentSpecification!)
        }
      },
      deleteEntity: (entityId: number): void => {
        if (this.currentSpecification) {
          const idx = this.currentSpecification.entities.findIndex((e) => e.id == entityId)
          if (idx >= 0) {
            this.entitiesTouched = true
            this.currentSpecification.entities.splice(idx, 1)
            this.entities = this.currentSpecification.entities
            deleteSpecificationI18nEntityNameAndOptions(this.currentSpecification, entityId)
          }
          this.setValidationMessages()
          if (this.specificationSubject) this.specificationSubject.next(this.currentSpecification!)
        }
      },
      getSaveObservable: (): Observable<void> => {
        return this.saveSubject
      },
      getCurrentMessage: (): Imessage | undefined => {
        return this.currentMessage
      },
    }

    this.originalSpecification = structuredClone(spec) as ImodbusSpecification
    this.entitiesTouched = false
    this.filesTouched = false
    this.i18nTouched = false
    if (this.specificationSubject) this.specificationSubject.next(this.currentSpecification!)
    let filename: string | null = null
    if (this.currentSpecification && this.currentSpecification.filename && this.currentSpecification.filename != '_new')
      filename = this.currentSpecification.filename
    this.enterSpecNameFormGroup
      .get('name')
      ?.setValue(
        this.config
          ? this.currentSpecification
            ? getSpecificationI18nName(this.currentSpecification, this.getMqttDiscoveryLanguage(), true)
            : null
          : null
      )
    this.enterSpecNameFormGroup.get('filename')?.setValue(filename)
    this.enterSpecNameFormGroup
      .get('model')
      ?.setValue(this.currentSpecification && this.currentSpecification.model ? this.currentSpecification.model : null)
    this.enterSpecNameFormGroup
      .get('manufacturer')
      ?.setValue(
        this.currentSpecification && this.currentSpecification.manufacturer ? this.currentSpecification.manufacturer : null
      )
    this.enterSpecNameFormGroup.markAsPristine()
    this.setValidationMessages()
  }

  setFilename() {
    const filename = getFileNameFromName(this.enterSpecNameFormGroup.get('name')?.value)
    const fForm = this.enterSpecNameFormGroup.get('filename')!
    if (
      this.currentSpecification &&
      [SpecificationStatus.added, SpecificationStatus.new].indexOf(this.currentSpecification.status) >= 0 &&
      fForm &&
      (fForm.value == null || fForm.value.length == 0)
    )
      fForm.patchValue(filename)
  }
  copyToSpec() {
    if (!this.currentSpecification)
      this.currentSpecification = {
        filename: '',
        files: [],
        entities: [],
        i18n: [],
        identified: IdentifiedStates.unknown,
        status: SpecificationStatus.new,
      }
    if (this.enterSpecNameFormGroup.valid) {
      this.currentSpecification.filename = this.enterSpecNameFormGroup.get('filename')?.value!
      this.currentSpecification.model =
        this.enterSpecNameFormGroup.get('model')?.value != null ? this.enterSpecNameFormGroup.get('model')?.value : undefined
      this.currentSpecification.manufacturer =
        this.enterSpecNameFormGroup.get('manufacturer')?.value != null
          ? this.enterSpecNameFormGroup.get('manufacturer')?.value
          : undefined
      setSpecificationI18nName(
        this.currentSpecification,
        this.getMqttDiscoveryLanguage(),
        this.enterSpecNameFormGroup.get('name')!.value!
      )
    }
    this.setValidationMessages()
    const e = structuredClone(this.currentSpecification.entities)
    I18nService.specificationTextsToTranslation(this.currentSpecification, this.getMqttDiscoveryLanguage())
    this.currentSpecification.entities = e
    this.entities = e
    if (this.specificationSubject) this.specificationSubject.next(this.currentSpecification!)
  }
  getTranslatedSpecName(): string | null {
    if (this.getMqttDiscoveryLanguage() && this.currentSpecification)
      return getSpecificationI18nName(this.currentSpecification!, this.getMqttDiscoveryLanguage(), true)
    return null
  }
  updateDocuments($event: IimageAndDocumentUrl[]) {
    if (!$event || !this.currentSpecification) return
    this.currentSpecification!.files = $event //update documents
    this.filesTouched = true
    this.setValidationMessages()
  }
  updateTranslation(entity: ImodbusEntityWithName): void {
    if (entity && this.currentSpecification) {
      if (entity.name)
        setSpecificationI18nEntityName(this.currentSpecification, this.getMqttDiscoveryLanguage(), entity.id, entity.name)
      if (entity.converterParameters && (entity.converterParameters as Iselect).options)
        (entity.converterParameters as Iselect).options?.forEach((option) => {
          setSpecificationI18nEntityOptionName(
            this.currentSpecification as IbaseSpecification,
            this.getMqttDiscoveryLanguage(),
            entity.id,
            option.key,
            option.name
          )
        })
    }
  }
  updateI18n($event: IUpdatei18nText) {
    if (!$event || !this.currentSpecification) return
    I18nService.updateSpecificationI18n($event.key, this.currentSpecification!, this.getMqttDiscoveryLanguage())
    if ($event.key == 'name') {
      const specName = getSpecificationI18nName(this.currentSpecification, this.getMqttDiscoveryLanguage(), true)
      if (specName) this.enterSpecNameFormGroup.get('name')!.setValue(specName)
    }

    this.setValidationMessages()
    this.i18nTouched = true
  }
  saveSpecification(close: boolean = false) {
    if (
      this.slaveid != undefined &&
      this.busId != undefined &&
      this.currentSpecification &&
      this.entities &&
      this.validateSpecification(this.currentSpecification)
    ) {
      const es = structuredClone(this.entities)
      es.forEach((e) => {
        if (e.name) setSpecificationI18nEntityName(this.currentSpecification!, this.getMqttDiscoveryLanguage(), e.id, e.name)
        delete (e as any).name
      })
      this.currentSpecification.entities = es
      I18nService.specificationTextsToTranslation(this.currentSpecification, this.getMqttDiscoveryLanguage())
      this.entityApiService
        .postSpecification(
          this.currentSpecification,
          this.busId,
          this.slaveid,
          this.originalSpecification ? this.originalSpecification.filename : null
        )
        .subscribe((spec) => {
          this.entityApiService.getModbusSpecification(this.busId!, this.slaveid!, spec.filename).subscribe((spec) => {
            this.setCurrentSpecification(spec)
            this.entitiesTouched = false
            this.filesTouched = false
            this.i18nTouched = false
            this.enterSpecNameFormGroup.markAsPristine()
            this.saveSubject.next()
            if (close) this.closeAndBack()
          })
        })
    }
  }

  saveSpecificationAndBack() {
    this.saveSpecification(true)
  }

  closeAndBack() {
    this.router.navigate(['/slaves', this.busId])
  }
  getFilenane(): string {
    if (this.currentSpecification) return this.currentSpecification.filename
    return ''
  }
  getFiles(): IimageAndDocumentUrl[] {
    if (this.currentSpecification) return this.currentSpecification.files
    return []
  }
  getEntities(): ImodbusEntity[] {
    if (this.currentSpecification) return this.currentSpecification.entities
    return []
  }
  drop(event: CdkDragDrop<ImodbusEntityWithName[] | undefined>) {
    if (this.entities && event) {
      moveItemInArray<ImodbusEntityWithName>(this.entities, event.previousIndex, event.currentIndex)
      this.entitiesTouched = true
    }
  }
  getSpecification(): IbaseSpecification {
    return this.currentSpecification!
  }
  validateSpecification(spec: ImodbusSpecification, msgs: string[] | undefined = undefined): boolean {
    const buffer: string[] = []
    if (msgs) msgs = []
    else msgs = buffer
    if (!spec.filename || spec.filename.length == 0) msgs.push('No filename for specification')
    if (!spec.entities || spec.entities.length == 0) msgs.push('No entity in specification')
    if (!spec.files || spec.files.length == 0) msgs.push('No files in specification')
    if (!spec.i18n || spec.i18n.length == 0) msgs.push('No translations in specification')
    return msgs.length == 0
  }

  ngOnInit(): void {
    this.entityApiService.getConfiguration().subscribe((config) => {
      this.config = config
      const dispHexFg = this.displayHexFormGroup.get('displayHex')
      this.displayHex = this.config.displayHex ? this.config.displayHex : false
      if (dispHexFg) dispHexFg.setValue(this.config.displayHex)
      this.specServices = new SpecificationServices(this.getMqttDiscoveryLanguage(), this.entityApiService)
      this.sub = this.route.params.subscribe((params) => {
        this.busId = +params['busid']
        this.slaveid = +params['slaveid']
        this.disabled = params['disabled'] != 'false'
        if (this.busId != undefined || this.slaveid != undefined)
          this.entityApiService.getSlave(this.busId, this.slaveid).subscribe((slave) => {
            if (!this.currentSpecification)
              if (slave.specificationid)
                this.entityApiService.getSpecification(slave.specificationid).subscribe((spec) => {
                  this.setCurrentSpecification(spec as ImodbusSpecification)
                  this.entityApiService
                    .getModbusSpecification(this.busId!, this.slaveid!, slave.specificationid)
                    .subscribe(this.setCurrentSpecification.bind(this))
                })
              else this.setCurrentSpecification(structuredClone(newSpecification))
          })
      })
    })
  }

  getValidationMessage(message: Imessage): string {
    if (this.specServices) return this.specServices.getValidationMessage(this.currentSpecification!, message)
    else return 'unknown message'
  }
  setValidationMessages(): void {
    if (!this.currentSpecification) return
    // specification component may have changed the stored specification
    // So, it must post the changes.
    // However, the validation, can happen only for existant test data.
    this.entityApiService
      .postForSpecificationValidation(this.currentSpecification!, this.getMqttDiscoveryLanguage())
      .subscribe((mesgs) => {
        this.validationMessages = mesgs
      })
  }

  getErrorMessageHint(message: string): string {
    switch (message) {
      case 'Timed out':
        return 'Please check the timeout in'
    }
    return ''
  }

  isValid(): boolean {
    if (this.currentSpecification) {
      return this.validationForms.valid
    }
    return false
  }
  jump2Message(message: Imessage) {
    this.currentMessage = message
  }
  isTouched(): boolean {
    return this.entitiesTouched || this.i18nTouched || !this.enterSpecNameFormGroup.pristine
  }

  @HostListener('window:beforeunload')
  canDeactivate(): boolean {
    if (this.isTouched() && !this.router.url.includes('tokenWasExpired')) {
      const result = window.confirm('There are unsaved changes! Are you sure?')
      return !result
    }
    return false
  }

  getUrlTitle(url: IimageAndDocumentUrl): string {
    return getBaseFilename(url.url)
  }

  getStatusIcon(status: SpecificationStatus | null): string {
    return SpecificationServices.getStatusIcon(status)
  }
  getStatusText(status: SpecificationStatus | null): string {
    return SpecificationServices.getStatusText(status)
  }
  onDisplayHexChanged(event: MatSlideToggleChange) {
    this.displayHex = event.checked
    if (!this.config) return

    this.config.displayHex = event.checked
    this.entityApiService.postConfiguration(this.config).subscribe(() => {})
  }
}
