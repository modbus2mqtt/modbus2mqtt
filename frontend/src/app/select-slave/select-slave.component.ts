import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild } from '@angular/core'
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ValidationErrors,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms'
import { MatListModule } from '@angular/material/list'

import { ApiService } from '../services/api-service'
import {
  getSpecificationI18nName,
  SpecificationStatus,
  IdentifiedStates,
  getSpecificationI18nEntityName,
  ImodbusEntity,
  ImodbusSpecification,
  Ientity,
  Ispecification,
  IspecificationSummary,
  IidentEntity,
} from '@shared/specification'
import { getCurrentLanguage } from '../utils/language'
import { Clipboard } from '@angular/cdk/clipboard'
import { Observable, ReplaySubject, Subscription } from 'rxjs'
import { ActivatedRoute, Router } from '@angular/router'
import { SessionStorage } from '../services/SessionStorage'
import { M2mErrorStateMatcher } from '../services/M2mErrorStateMatcher'
import { MatTreeModule } from '@angular/material/tree'
import { MatIconModule } from '@angular/material/icon'
import { MatButtonModule } from '@angular/material/button'

import {
  Islave,
  IidentificationSpecification,
  IBus,
  getConnectionName,
  PollModes,
  Slave,
  Iconfiguration,
  IEntityCommandTopics,
  ImodbusStatusForSlave,
} from '@shared/server'
import { MatInput } from '@angular/material/input'
import { MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle } from '@angular/material/expansion'
import { MatOption } from '@angular/material/core'
import { MatSelect } from '@angular/material/select'
import { MatFormField, MatLabel, MatError } from '@angular/material/form-field'
import { MatIcon } from '@angular/material/icon'
import { MatIconButton } from '@angular/material/button'
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card'
import { MatIconButtonSizesModule } from 'mat-icon-button-sizes'

import { AsyncPipe } from '@angular/common';
import { MatTooltip } from '@angular/material/tooltip'
import { MatSlideToggle } from '@angular/material/slide-toggle'
import { ModbusErrorComponent } from '../modbus-error/modbus-error.component'

interface IuiSlave {
  slave: Islave
  label: string
  specsObservable?: Observable<IidentificationSpecification[]>
  specification?: Ispecification
  slaveForm: FormGroup
  commandEntities?: ImodbusEntity[]
  selectedEntitites?: any
}

@Component({
  selector: 'app-select-slave',
  templateUrl: './select-slave.component.html',
  styleUrls: ['./select-slave.component.css'],
  standalone: true,
  imports: [
    ModbusErrorComponent,
    MatSlideToggle,
    MatTooltip,
    FormsModule,
    ReactiveFormsModule,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatIconButton,
    MatTreeModule,
    MatIconModule,
    MatIconButtonSizesModule,
    MatButtonModule,
    MatIcon,
    MatCardContent,
    MatFormField,
    MatLabel,
    MatListModule,
    MatSelect,
    MatOption,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    MatInput,
    MatError,
    AsyncPipe
],
})
export class SelectSlaveComponent extends SessionStorage implements OnInit {
  preparedIdentSpecs: IidentificationSpecification[] | undefined
  preparedSpecs: IspecificationSummary[] | undefined
  getDetectSpecToolTip(): string {
    return this.slaveNewForm.get('detectSpec')?.value == true
      ? 'If there is exactly one specification matching to the modbus data for this slave, ' +
          'the specification will be selected automatically'
      : 'Please set the specification for the new slave after adding it'
  }
  keyDown(event: Event, fg: FormGroup) {
    if ((event.target as HTMLInputElement).name == 'slaveId') this.addSlave(fg)
    event.preventDefault()
  }

  getSpecIcon() {
    throw new Error('Method not implemented.')
  }
  currentLanguage: string | undefined
  busname: string | undefined
  constructor(
    private _formBuilder: FormBuilder,
    private route: ActivatedRoute,
    private entityApiService: ApiService,
    private routes: Router,
    private clipboard: Clipboard
  ) {
    super()
    this.slaveNewForm = this._formBuilder.group({
      slaveId: [null],
      detectSpec: [false],
    })
  }
  showAllPublicSpecs = new FormControl<boolean>(false)
  uiSlaves: IuiSlave[] = []
  config: Iconfiguration | undefined
  slaves: Islave[] = []

  // label:string;
  // slaveForms: FormGroup[]
  // specs:Observable<IidentificationSpecification[]> []=[]
  //slavesFormArray: FormArray<FormGroup>
  slaveNewForm: FormGroup
  paramsSubscription: Subscription | undefined
  errorStateMatcher = new M2mErrorStateMatcher()

  bus: IBus | undefined
  preselectedSlaveId: number | undefined = undefined
  @ViewChild('slavesBody') slavesBody: ElementRef | undefined
  @Output() slaveidEventEmitter = new EventEmitter<number | undefined>()
  ngOnInit(): void {
    this.entityApiService.getConfiguration().subscribe((config) => {
      this.config = config
      this.currentLanguage = getCurrentLanguage()
      this.entityApiService.getSpecifications().subscribe((specs) => {
        this.preparedSpecs = specs
      })
      this.paramsSubscription = this.route.params.subscribe((params) => {
        const busId = +params['busid']
        this.entityApiService.getBus(busId).subscribe((bus) => {
          this.bus = bus
          if (this.bus) {
            this.busname = getConnectionName(this.bus.connectionData)
            this.getIdentSpecs(undefined).then((identSpecs) => {
              this.preparedIdentSpecs = identSpecs
            })
            this.updateSlaves()
          }
        })
      })
    })
  }

  private updateSlaves(detectSpec?: boolean) {
    if (!this.bus) return
    this.entityApiService.getSlaves(this.bus.busId).subscribe((slaves) => {
      console.log(JSON.stringify(slaves))
      this.uiSlaves = []
      slaves.forEach((s) => {
        this.uiSlaves.push(this.getUiSlave(s, detectSpec))
      })
      this.generateSlavesArray()
    })
  }
  private generateSlavesArray(): void {
    this.slaves = []
    this.uiSlaves.forEach((uis) => {
      this.slaves.push(uis.slave)
    })
  }
  onRootTopicChange(uiSlave: IuiSlave): any {
    if (!uiSlave.slave || (uiSlave.slave as Islave).specificationid == undefined) return {}
    this.addSpecificationToUiSlave(uiSlave, () => {
      const rootTopic = uiSlave.slaveForm.get('rootTopic')!.value
      if (rootTopic) uiSlave.slave.rootTopic = rootTopic
      this.fillCommandTopics(uiSlave)
      uiSlave.slaveForm.updateValueAndValidity()
      const newUiSlaves: IuiSlave[] = []
      this.uiSlaves.forEach((uis) => {
        if (uis.slave.slaveid == uiSlave.slave.slaveid) newUiSlaves.push(uiSlave)
        else newUiSlaves.push(uis)
      })
      this.uiSlaves = newUiSlaves
    })
  }
  fillCommandTopics(uiSlave: IuiSlave) {
    if (!this.config || !this.bus) return
    const sl = new Slave(this.bus.busId, uiSlave.slave, this.config.mqttbasetopic)
    uiSlave.commandEntities = []
    if (uiSlave.slave.specification && uiSlave.slave.specification.entities) {
      uiSlave.slave.specification.entities.forEach((ent) => {
        const cmdTopic: IEntityCommandTopics = sl.getEntityCommandTopic(ent)!
        if (cmdTopic) {
          cmdTopic.commandTopic = this.getRootUrl(uiSlave.slaveForm) + cmdTopic.commandTopic
          uiSlave.commandEntities!.push(ent as any)
        }
      })
    }
  }
  getStateTopic(uiSlave: IuiSlave): string | undefined {
    if (!this.config || !this.bus) return undefined
    const sl = new Slave(this.bus.busId, uiSlave.slave, this.config.mqttbasetopic)
    return sl.getStateTopic()
  }
  getStatePayload(uiSlave: IuiSlave): string | undefined {
    if (!this.config || !this.bus) return undefined
    const sl = new Slave(this.bus.busId, uiSlave.slave, this.config.mqttbasetopic)
    const spec = sl.getSpecification()
    return spec ? sl.getStatePayload(spec.entities as any, '') : ''
  }
  getTriggerPollTopic(uiSlave: IuiSlave): string | undefined {
    if (!this.config || !this.bus) return undefined
    const sl = new Slave(this.bus.busId, uiSlave.slave, this.config.mqttbasetopic)
    return sl.getTriggerPollTopic()
  }

  getCommandTopic(uiSlave: IuiSlave, entity: Ientity): string | undefined {
    if (!this.config || !this.bus) return undefined
    const sl = new Slave(this.bus.busId, uiSlave.slave, this.config.mqttbasetopic)
    const ct = sl.getEntityCommandTopic(entity)
    return ct ? ct.commandTopic : ''
  }
  getModbusCommandTopic(uiSlave: IuiSlave, entity: Ientity): string | undefined {
    if (!this.config || !this.bus) return undefined
    const sl = new Slave(this.bus.busId, uiSlave.slave, this.config.mqttbasetopic)
    const ct = sl.getEntityCommandTopic(entity)
    return ct && ct.modbusCommandTopic ? ct.modbusCommandTopic : ''
  }
  // getDetectedSpecs(uiSlave: IuiSlave, detectSpec: boolean | undefined): Observable<IidentificationSpecification[]> {
  //   if (!this.config || !this.bus) return new Observable<IidentificationSpecification[]>((subscriber) => subscriber.next([]))
  //   let rc = this.entityApiService
  //     .getSpecsDetection(this.bus.busId!, uiSlave.slave.slaveid, this.showAllPublicSpecs.value!, this.config.mqttdiscoverylanguage)
  //     .pipe(
  //       map((identSpecs) => {
  //         let found: IidentificationSpecification | undefined = undefined
  //         if (detectSpec) {
  //           let foundOne = false
  //           identSpecs.forEach((ispec) => {
  //             if (ispec.identified == IdentifiedStates.identified)
  //               if (found == undefined) {
  //                 found = ispec
  //                 foundOne = true
  //               } else foundOne = false
  //           })
  //           if (foundOne) {
  //             let ctrl = uiSlave.slaveForm.get('specificationid')
  //             if (ctrl) {
  //               ctrl.setValue(found)
  //               // This will not considered as touched, because the uislave.slaveForm is not active yet
  //               // It will be marked as touched in this.addSlave
  //             }
  //           }
  //         }
  //         return identSpecs
  //       })
  //     )
  //   return rc
  // }
  private getIdentSpecs(uiSlave: IuiSlave | undefined): Promise<IidentificationSpecification[]> {
    return new Promise<IidentificationSpecification[]>((resolve, _reject) => {
      if (!this.bus) {
        resolve([])
        return
      }
      const fct = (specModbus: ImodbusSpecification | undefined) => {
        const rci: IidentificationSpecification[] = []
        if (!this.preparedSpecs || !this.config || !this.bus) {
          resolve(rci)
          return
        }
        this.preparedSpecs!.forEach((spec) => {
          const name = getSpecificationI18nName(spec, this.config!.mqttdiscoverylanguage)
          rci.push({
            name: name,
            identified: specModbus && spec.filename == specModbus.filename ? specModbus.identified : IdentifiedStates.unknown,
            filename: spec.filename,
            status: spec.status,
          } as IidentificationSpecification)
        })
        resolve(rci)
      }
      if (uiSlave && uiSlave.slave.specificationid)
        this.entityApiService
          .getModbusSpecification(this.bus.busId, uiSlave.slave.slaveid, uiSlave.slave.specificationid, false)
          .subscribe((spec) => {
            console.log('DSSSS')
            fct(spec)
          })
      else fct(undefined)
    })
  }
  private getUiSlave(slave: Islave, _detectSpec: boolean | undefined): IuiSlave {
    const fg = this.initiateSlaveControl(slave, null)
    const rc: IuiSlave = {
      slave: slave,
      label: this.getSlaveName(slave),
      slaveForm: fg,
    } as any
    // ReplaySubject(1) so the template's `| async` receives the spec list even when
    // getIdentSpecs() resolves (microtask) before Angular subscribes via change detection.
    // A plain Subject would drop that early emission, leaving the dropdown empty.
    const sub = new ReplaySubject<IidentificationSpecification[]>(1)
    rc.specsObservable = sub
    this.getIdentSpecs(rc)
      .then((identSpecs) => {
        sub.next(identSpecs)
      })
      .catch((e) => {
        console.log(e.message)
      }) // getDetectedSpecs is disabled, because of performance issues
    this.addSpecificationToUiSlave(rc, () => {
      rc.selectedEntitites = this.getSelectedEntites(slave)
      this.fillCommandTopics(rc)
    })
    return rc
  }
  private updateUiSlaves(slave: Islave, detectSpec: boolean | undefined): void {
    const idx = this.uiSlaves.findIndex((s) => s.slave.slaveid == slave.slaveid)
    if (idx >= 0) this.uiSlaves[idx] = this.getUiSlave(slave, detectSpec)
    else this.uiSlaves.push(this.getUiSlave(slave, detectSpec))
  }
  private updateUiSlaveData(slave: Islave): void {
    const idx = this.uiSlaves.findIndex((s) => s.slave.slaveid == slave.slaveid)

    if (idx >= 0) {
      this.uiSlaves[idx].slave = slave
      this.uiSlaves[idx].label = this.getSlaveName(slave)
    }
  }
  ngOnDestroy(): void {
    this.paramsSubscription && this.paramsSubscription.unsubscribe()
  }

  showUnmatched() {
    this.showAllPublicSpecs.value
    this.updateSlaves(false)
  }
  compareSpecificationIdentification(o1: IidentificationSpecification, o2: IidentificationSpecification) {
    return o1 && o2 && o1.filename == o2.filename
  }
  identifiedTooltip(identified: IdentifiedStates | null | undefined): string {
    if (!identified || identified == -1) return 'no identification possible'
    if (identified == 1) return 'known device'
    return 'unknown device'
  }
  identifiedIcon(identified: IdentifiedStates | null | undefined): string {
    if (!identified || identified == -1) return 'thumbs_up_down'
    if (identified == 1) return 'thumb_up'
    return 'thumb_down'
  }
  // getIidentSpec(filename: string | undefined): IidentificationSpecification | undefined {
  //   if (!this.preparedIdentSpecs) return undefined
  //   return this.preparedIdentSpecs.find((is) => is.filename == filename)
  // }
  onSpecificationChange(uiSlave: IuiSlave) {
    const identSpec: IidentificationSpecification = uiSlave.slaveForm.get('specificationid')!.value
    if (uiSlave.slave != null) {
      if (identSpec == null) {
        delete uiSlave.slave.specification
        delete uiSlave.slave.specificationid
      } else {
        uiSlave.slave.specificationid = identSpec.filename
        this.addSpecificationToUiSlave(uiSlave, () => {
          uiSlave.slave.noDiscoverEntities = []
          uiSlave.selectedEntitites = this.getSelectedEntites(uiSlave.slave)
          uiSlave.label = this.getSlaveName(uiSlave.slave)
          uiSlave.slaveForm.get('discoverEntitiesList')!.setValue(this.buildDiscoverEntityList(uiSlave.slave))
          uiSlave.slaveForm.get('noDiscovery')!.setValue(uiSlave.slave.noDiscovery)
        })
      }
    }
  }
  buildDiscoverEntityList(slave: Islave): number[] {
    const rc: number[] = []
    if (slave && slave.specification && (slave.specification as ImodbusSpecification).entities)
      (slave.specification as ImodbusSpecification).entities.forEach((e) => {
        if (slave.noDiscoverEntities == undefined ? true : !slave.noDiscoverEntities.includes(e.id)) rc.push(e.id)
      })
    return rc
  }
  private slave2Form(slave: Islave, fg: FormGroup) {
    fg.get('name')!.setValue((slave.name ? slave.name : null) as string | null)
    fg.get('specificationid')!.setValue({ filename: slave.specificationid })
    fg.get('pollInterval')!.setValue(slave.pollInterval ? slave.pollInterval : 1000)
    fg.get('pollMode')!.setValue(slave.pollMode == undefined ? PollModes.intervall : slave.pollMode)
    fg.get('qos')!.setValue(slave.qos ? slave.qos : -1)
    fg.get('noDiscovery')!.setValue(slave.noDiscovery ? slave.noDiscovery : false)
    fg.get('configurationUrl')!.setValue(slave.configurationUrl ? slave.configurationUrl : null)
    fg.get('discoverEntitiesList')!.setValue(this.buildDiscoverEntityList(slave))
    if (slave.noDiscovery) fg.get('discoverEntitiesList')!.disable()
    else fg.get('discoverEntitiesList')!.enable()
  }

  initiateSlaveControl(slave: Islave, defaultValue: IidentificationSpecification | null): FormGroup {
    if (slave.slaveid >= 0) {
      const fg = this._formBuilder.group({
        hiddenSlaveId: [slave.slaveid],
        specificationid: [defaultValue],
        name: [slave.name],
        pollInterval: [slave.pollInterval],
        pollMode: [slave.pollMode],
        qos: [slave.qos],
        rootTopic: [slave.rootTopic],
        showUrl: [false],
        noDiscovery: [false],
        configurationUrl: [slave.configurationUrl],
        discoverEntitiesList: [[]],
      })
      this.slave2Form(slave, fg)
      return fg
    } else
      return this._formBuilder.group({
        slaveId: [null],
        specificationid: [defaultValue],
      })
  }

  hasDuplicateName(slaveId: number, name: string): boolean {
    let rc: boolean = false
    if (!name) {
      const theSlave = this.uiSlaves.find((s) => s != null && s.slave.slaveid == slaveId)
      if (theSlave && theSlave.slave.specificationid) name = theSlave.slave.specificationid
    }

    this.uiSlaves.forEach((uislave) => {
      if (uislave != null && uislave.slave.slaveid != slaveId) {
        const searchName: string | undefined = uislave.slave.name ? uislave.slave.name : uislave.slave.specificationid
        if (searchName == name) rc = true
      }
    })
    return rc
  }
  getRootUrl(fg: FormGroup): string {
    if (this.config && this.config.rootUrl && (fg.get('showUrl')!.value as boolean)) return this.config.rootUrl
    return ''
  }

  uniqueNameValidator: any = (slaveId: number, control: AbstractControl): ValidationErrors | null => {
    if (this.hasDuplicateName(slaveId, control.value)) return { duplicates: control.value }
    else return null
  }

  deleteSlave(slave: Islave | null) {
    if (slave != null && this.bus)
      this.entityApiService.deleteSlave(this.bus.busId, slave.slaveid).subscribe(() => {
        const dIdx = this.uiSlaves.findIndex((uis) => uis.slave.slaveid == slave.slaveid)
        if (dIdx >= 0) {
          this.uiSlaves.splice(dIdx, 1)
          this.updateSlaves(false)
        }
      })
  }

  getSlaveIdFromForm(newSlaveFormGroup: FormGroup): number {
    let slaveId: string = ''
    if (newSlaveFormGroup) slaveId = newSlaveFormGroup.get('slaveId')!.value
    return slaveId != undefined && parseInt(slaveId) >= 0 ? parseInt(slaveId) : -1
  }

  canAddSlaveId(newSlaveFormGroup: FormGroup): boolean {
    const slaveId: number = this.getSlaveIdFromForm(newSlaveFormGroup)
    return (
      slaveId >= 0 && null == this.uiSlaves.find((uis) => uis != null && uis.slave.slaveid != null && uis.slave.slaveid == slaveId)
    )
  }
  addSlave(newSlaveFormGroup: FormGroup): void {
    if (this.bus == undefined) return
    const slaveId: number = this.getSlaveIdFromForm(newSlaveFormGroup)
    const detectSpec = newSlaveFormGroup.get(['detectSpec'])?.value
    if (this.canAddSlaveId(newSlaveFormGroup))
      this.entityApiService.postSlave(this.bus.busId, { slaveid: slaveId }).subscribe((slave) => {
        const newUiSlave = this.getUiSlave(slave, detectSpec)
        const newUislaves = ([] as IuiSlave[]).concat(this.uiSlaves, [newUiSlave])
        this.uiSlaves = newUislaves
        // The value change during loading of selection list is before
        // Initialization of the UI
        // replacing this.uiSlaves with newUiSlaves will initialize and show it
        // Now, the new value needs to be marked as touched to enable cancel and save.
        if (detectSpec) {
          const specCtrl = newUiSlave.slaveForm.get('specificationid')

          if (specCtrl && specCtrl.value != undefined && specCtrl.value.filename != undefined)
            newUiSlave.slaveForm.markAllAsTouched()
        }
      })
  }
  private static form2SlaveSetValue(uiSlave: IuiSlave, controlname: string) {
    const val: any = uiSlave.slaveForm.get(controlname)!.value
    ;(uiSlave.slave as any)[controlname] = val == null ? undefined : val
  }

  private static controllers: string[] = ['name', 'rootTopic', 'pollInterval', 'pollMode', 'qos', 'noDiscovery', 'configurationUrl']
  private specCache = new Map<string, Ispecification>()
  private addSpecificationToUiSlave(uiSlave: IuiSlave, callback?: () => void) {
    const specId = uiSlave.slave.specificationid
    if (!specId) return
    const cached = this.specCache.get(specId)
    if (cached) {
      uiSlave.slave.specification = cached
      if (callback) callback()
      return
    }
    this.entityApiService.getSpecification(specId).subscribe((spec) => {
      this.specCache.set(specId, spec)
      uiSlave.slave.specification = spec
      if (callback) callback()
    })
  }
  saveSlave(uiSlave: IuiSlave) {
    SelectSlaveComponent.controllers.forEach((controller) => {
      SelectSlaveComponent.form2SlaveSetValue(uiSlave, controller)
    })
    const spec: IidentificationSpecification = uiSlave.slaveForm.get('specificationid')!.value
    const selectedEntities: number[] = uiSlave.slaveForm.get('discoverEntitiesList')!.value
    if (spec && spec.filename) {
      uiSlave.slave.specificationid = spec.filename
      this.addSpecificationToUiSlave(uiSlave, () => {
        uiSlave.slave.noDiscoverEntities = []
        if (selectedEntities && uiSlave.slave.specification) {
          (uiSlave.slave.specification as Ispecification).entities.forEach((e: IidentEntity) => {
            if (!selectedEntities.includes(e.id)) uiSlave.slave.noDiscoverEntities!.push(e.id)
          })
        }
        this.postSaveSlaveRequest(uiSlave)
      })
    } else {
      this.postSaveSlaveRequest(uiSlave)
    }
  }
  private postSaveSlaveRequest(uiSlave: IuiSlave) {
    if (this.bus)
      this.entityApiService.postSlave(this.bus.busId, uiSlave.slave).subscribe((slave) => {
        this.updateUiSlaves(slave, false)
      })
  }
  cancelSlave(uiSlave: IuiSlave) {
    if (!this.preparedIdentSpecs) return
    uiSlave.slaveForm.reset()
    SelectSlaveComponent.controllers.forEach((controlname) => {
      let value = (uiSlave.slave as any)[controlname]
      if (controlname == 'specificationid')
        value = this.preparedIdentSpecs!.find((s) => s.filename == uiSlave.slave.specificationid)
      uiSlave.slaveForm.get(controlname)!.setValue(value)
    })
    this.slave2Form(uiSlave.slave, uiSlave.slaveForm)
  }

  getSpecificationI18nName(spec: IspecificationSummary, language: string): string | null {
    return getSpecificationI18nName(spec, language)
  }
  statusTooltip(status: SpecificationStatus | undefined) {
    switch (status) {
      case SpecificationStatus.cloned:
        return 'Cloned: This specifications was copied from a published one'
      case SpecificationStatus.added:
        return 'Added: This  was created newly'
      case SpecificationStatus.published:
        return 'Published: You can copy the published specification to make your changes'
      case SpecificationStatus.contributed:
        return 'Contributed: Readonly until the contributions process is finished'
      case SpecificationStatus.new:
        return 'New: Create a new specification.'
      default:
        return 'unknown'
    }
  }
  statusIcon(status: SpecificationStatus | undefined) {
    switch (status) {
      case SpecificationStatus.cloned:
        return 'file_copy'
      case SpecificationStatus.added:
        return 'add'
      case SpecificationStatus.published:
        return 'public'
      case SpecificationStatus.contributed:
        return 'contributed'
      case SpecificationStatus.new:
        return 'new_releases'
      default:
        return 'unknown'
    }
  }
  addSpecification(slave: Islave) {
    if (this.bus) {
      slave.specification = undefined
      slave.specificationid = undefined

      this.editSpecification(slave)
    }
  }
  editSpecification(slave: Islave) {
    if (this.bus) {
      this.entityApiService.postSlave(this.bus.busId, slave).subscribe(() => {
        this.routes.navigate(['/specification', this.bus!.busId, slave.slaveid, false])
      })
    }
  }
  // editEntitiesList(slave: Islave) {
  //   this.routes.navigate(['/entities', this.bus!.busId, slave.slaveid]);
  // }

  getSlaveName(slave: Islave): string {
    if (slave == null) return 'New'
    let rc: string | undefined = undefined
    if (slave.name) rc = slave.name
    else if (slave.specification) {
      const name = getSpecificationI18nName(slave.specification, this.config ? this.config.mqttdiscoverylanguage : 'en')
      if (name) rc = name
    } else if (slave.specificationid && this.preparedSpecs) {
      const summary = this.preparedSpecs.find((s) => s.filename === slave.specificationid)
      if (summary) {
        const name = getSpecificationI18nName(summary, this.config ? this.config.mqttdiscoverylanguage : 'en')
        if (name) rc = name
      }
    }
    if (rc == undefined) rc = 'Unknown'
    return rc + '(' + slave.slaveid + ')'
  }
  getSpecEntityName(uiSlave: IuiSlave, entityId: number): string {
    if (!this.config || !this.bus) return ''
    if (uiSlave != null && uiSlave.slave && uiSlave.slave.specificationid) {
      const sl = new Slave(this.bus.busId, uiSlave.slave, this.config.mqttbasetopic)
      const name = sl.getEntityName(entityId)
      return name != undefined ? name : ''
    }
    return ''
  }
  copy2Clipboard(text: string) {
    this.clipboard.copy(text)
  }
  getSelectedEntites(slave: Islave): { id: number; name: string }[] {
    const rc: { id: number; name: string }[] = []
    if (slave && slave.specification && (slave.specification as ImodbusSpecification).entities)
      (slave.specification as ImodbusSpecification).entities.forEach((e) => {
        let name: string | undefined | null = e.name
        if (!name)
          name = getSpecificationI18nEntityName(
            slave.specification as ImodbusSpecification,
            this.currentLanguage ? this.currentLanguage : 'en',
            e.id
          )
        rc.push({ id: e.id, name: name ? name : '' })
      })
    return rc
  }
  needsSaving(idx: number): boolean {
    const fg = this.uiSlaves[idx].slaveForm
    return fg == undefined || fg.touched
  }
  getNoDiscoveryText(uiSlave: IuiSlave) {
    if (uiSlave.slaveForm.get('noDiscovery')!.value) return 'Discovery is disabled for the complete slave.'
    else return 'Discovery is enabled for the complete slave.'
  }
  disableDiscoverEntitiesList(uiSlave: IuiSlave) {
    if (uiSlave.slaveForm.get('noDiscovery')!.value) uiSlave.slaveForm.get('discoverEntitiesList')!.enable()
    else uiSlave.slaveForm.get('discoverEntitiesList')!.disable()
  }
  getModbusErrors(uiSlave: IuiSlave): ImodbusStatusForSlave | undefined {
    if (!uiSlave || !uiSlave.slave || !uiSlave.slave.modbusStatusForSlave)
      return { requestCount: [0, 0, 0, 0, 0, 0, 0, 0, 0], errors: [], queueLength: 0 }
    return uiSlave.slave.modbusStatusForSlave
  }
}
