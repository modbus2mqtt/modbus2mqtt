import { Component, ElementRef, EventEmitter, OnInit, Output, signal, ViewChild, WritableSignal } from '@angular/core'
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
import { ReplaySubject, Subscription } from 'rxjs'
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

import { AsyncPipe } from '@angular/common'
import { MatTooltip } from '@angular/material/tooltip'
import { MatSlideToggle } from '@angular/material/slide-toggle'
import { ModbusErrorComponent } from '../modbus-error/modbus-error.component'

interface IuiSlave {
  slave: Islave
  label: string
  specsObservable?: ReplaySubject<IidentificationSpecification[]>
  specification?: Ispecification
  slaveForm: FormGroup
  commandEntities?: ImodbusEntity[]
  selectedEntitites?: any
  // Live preview of the HTTP POST body. A signal (not a template method call) so it re-renders
  // under zoneless change detection when the push entity selection or root form values change.
  httpPushBody?: WritableSignal<string | undefined>
  // Set once the per-slave modbus identification has been fetched lazily
  // (on first dropdown open). Keeps the initial page load free of N device reads.
  identSpecsLoaded?: boolean
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
    AsyncPipe,
  ],
})
export class SelectSlaveComponent extends SessionStorage implements OnInit {
  preparedIdentSpecs: IidentificationSpecification[] | undefined
  preparedSpecs: IspecificationSummary[] | undefined
  // Literal strings (contain {{ }}) kept out of the template to avoid Angular interpolation.
  readonly httpPushUrlPlaceholder = 'https://heimvio.de/readings/{{ serialnumber }}'
  readonly httpPushUrlTooltip =
    'Full target URL. Use {{ path }} placeholders to insert entity values, e.g. {{ serialnumber }}.\n' +
    'The reserved {{ pollDate }} inserts the poll time as ISO 8601 UTC, e.g. 2026-07-10T08:00:00Z ' +
    '(e.g. ...?at={{ pollDate }}).\n' +
    'The reserved {{ slaveName }} inserts the Slave Name from Slave Settings ' +
    '(e.g. ...?meter={{ slaveName }}). All values are URL-encoded.'
  readonly pollScheduleTooltip =
    'Optional Unix cron expression. When set it overrides Poll Interval.\n' +
    '5 fields: minute hour day-of-month month day-of-week.\n' +
    'Examples:  "0 * * * *" = every full hour    "*/15 * * * *" = every 15 min    "0 6 * * mon" = Mondays 06:00'
  // Lightweight client-side check (5 fields, allowed characters). The backend does the full
  // validation and skips polling on an invalid expression.
  static cronFormatValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value as string | null
    if (value == null || value.trim().length === 0) return null
    const fields = value.trim().split(/\s+/)
    if (fields.length !== 5) return { cron: true }
    return fields.every((f) => /^[*\d,/\-a-zA-Z]+$/.test(f)) ? null : { cron: true }
  }

  // Common schedules offered in the preset dropdown ('' = no schedule, use the interval).
  readonly pollScheduleCustom = '__custom__'
  readonly pollSchedulePresets: { label: string; value: string }[] = [
    { label: 'No schedule (use interval)', value: '' },
    { label: 'Every 5 min (:00, :05, …)', value: '*/5 * * * *' },
    { label: 'Every 15 min (:00, :15, :30, :45)', value: '*/15 * * * *' },
    { label: 'Every 30 min (:00, :30)', value: '*/30 * * * *' },
    { label: 'Every full hour (:00)', value: '0 * * * *' },
    { label: 'Every 6 h (00, 06, 12, 18:00)', value: '0 */6 * * *' },
    { label: 'Every day at 06:00', value: '0 6 * * *' },
    { label: 'Every day at midnight', value: '0 0 * * *' },
  ]

  // Maps a cron string to the matching preset value, or the "custom" sentinel for anything else.
  private presetForSchedule(schedule: string | undefined | null): string {
    if (schedule == undefined || schedule.trim().length === 0) return ''
    const match = this.pollSchedulePresets.find((p) => p.value === schedule.trim())
    return match ? match.value : this.pollScheduleCustom
  }

  // Selecting a preset writes its cron into pollSchedule; "Custom cron…" keeps the current value
  // and reveals the raw input for editing.
  onPollSchedulePresetChange(fg: FormGroup): void {
    const preset = fg.get('pollSchedulePreset')!.value as string
    if (preset !== this.pollScheduleCustom) fg.get('pollSchedule')!.setValue(preset.length > 0 ? preset : null)
  }

  // Human-readable description of common cron shapes; '' when there is no confident translation
  // (the raw expression stays visible in the input). Used to give live feedback under the field.
  describeCron(expression: string | null | undefined): string {
    if (expression == undefined || expression.trim().length === 0) return ''
    const f = expression.trim().split(/\s+/)
    if (f.length !== 5) return ''
    const [min, hr, dom, mon, dow] = f
    const allDate = dom === '*' && mon === '*'
    // Step minutes fire on the clock (e.g. */15 → :00, :15, :30, :45), so spell out the marks.
    const everyMin = min.match(/^\*\/(\d+)$/)
    if (everyMin && hr === '*' && allDate && dow === '*') {
      const n = Number(everyMin[1])
      const marks: string[] = []
      for (let m = 0; m < 60; m += n) marks.push(':' + String(m).padStart(2, '0'))
      return `Every ${n} minutes (at ${this.formatMarks(marks)})`
    }
    const everyHr = hr.match(/^\*\/(\d+)$/)
    if (min === '0' && everyHr && allDate && dow === '*') {
      const n = Number(everyHr[1])
      const marks: string[] = []
      for (let h = 0; h < 24; h += n) marks.push(String(h).padStart(2, '0') + ':00')
      return `Every ${n} hours (at ${this.formatMarks(marks)})`
    }
    if (/^\d+$/.test(min) && hr === '*' && allDate && dow === '*')
      return min === '0' ? 'Every full hour (at :00)' : `Every hour at :${min.padStart(2, '0')}`
    if (/^\d+$/.test(min) && /^\d+$/.test(hr) && allDate) {
      const time = hr.padStart(2, '0') + ':' + min.padStart(2, '0')
      if (dow === '*') return `Every day at ${time}`
      const days = this.describeDow(dow)
      if (days) return `${days} at ${time}`
    }
    return ''
  }

  // Joins clock marks, truncating long lists (e.g. */5 yields 12 minute marks).
  private formatMarks(marks: string[]): string {
    return marks.length <= 4 ? marks.join(', ') : marks.slice(0, 4).join(', ') + ', …'
  }

  private describeDow(dow: string): string {
    const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
    const aliases: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
    if (!/^[a-z0-9]+$/i.test(dow)) return '' // lists/ranges → no simple description
    const n = aliases[dow.toLowerCase()] ?? Number(dow)
    if (!Number.isInteger(n) || n < 0 || n > 7) return ''
    return names[n === 7 ? 0 : n]
  }
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
  // Per-uiSlave form valueChanges subscriptions driving the live push-body preview signals.
  private subscriptions: Subscription[] = []
  errorStateMatcher = new M2mErrorStateMatcher()

  bus: IBus | undefined
  preselectedSlaveId: number | undefined = undefined
  @ViewChild('slavesBody') slavesBody: ElementRef | undefined
  @Output() slaveidEventEmitter = new EventEmitter<number | undefined>()
  ngOnInit(): void {
    this.currentLanguage = getCurrentLanguage()
    // Fire the independent requests in parallel instead of chaining config -> bus -> slaves.
    // The slave cards only need the (small) slaves list, so they can render as soon as it
    // arrives; config/specs/bus fill in the labels, dropdown options and header a moment later.
    this.entityApiService.getConfiguration().subscribe((config) => {
      this.config = config
      this.refreshSpecDerivedState()
      this.refreshLoadedSlaveDetails()
    })
    this.entityApiService.getSpecifications().subscribe((specs) => {
      this.preparedSpecs = specs
      this.refreshSpecDerivedState()
    })
    this.paramsSubscription = this.route.params.subscribe((params) => {
      const busId = +params['busid']
      // Render the slave cards ASAP; getBus is only needed for the header and command topics.
      this.updateSlaves(busId)
      this.entityApiService.getBus(busId).subscribe((bus) => {
        this.bus = bus
        if (this.bus) {
          this.busname = getConnectionName(this.bus.connectionData)
          this.refreshLoadedSlaveDetails()
        }
      })
    })
  }

  private updateSlaves(busId: number, detectSpec?: boolean) {
    this.entityApiService.getSlaves(busId).subscribe((slaves) => {
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
  // Preview of the HTTP POST body for the currently selected push entities / root, built from the
  // live form values so the selection influences the output immediately. Values are placeholders
  // (empty strings) like the state payload example, since the spec carries no runtime mqttValue here.
  getHttpPushBody(uiSlave: IuiSlave): string | undefined {
    if (!this.config || !this.bus) return undefined
    const url: string | null = uiSlave.slaveForm.get('httpPushUrl')!.value
    if (!url || url.length === 0) return ''
    const root: string | null = uiSlave.slaveForm.get('httpPushRoot')!.value
    const pushEntities: number[] = uiSlave.slaveForm.get('pushEntitiesList')!.value ?? []
    const httpPush: any = { url, pushEntities }
    if (root && root.length > 0) httpPush.root = root
    const sl = new Slave(this.bus.busId, { ...uiSlave.slave, httpPush }, this.config.mqttbasetopic)
    const spec = sl.getSpecification()
    if (!spec) return ''
    const body = sl.getHttpPushPayload(spec.entities as any, '')
    return body != null ? body : `(root "${root}" not found in the payload)`
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
      if (uiSlave && uiSlave.slave.specificationid && this.bus)
        this.entityApiService
          .getModbusSpecification(this.bus.busId, uiSlave.slave.slaveid, uiSlave.slave.specificationid, false)
          .subscribe((spec) => {
            resolve(this.buildIdentSpecsList(spec))
          })
      else resolve(this.buildIdentSpecsList(undefined))
    })
  }
  // Builds the specification dropdown list from the cheap, already-loaded preparedSpecs.
  // Needs no bus and does no network call; the optional specModbus only flags which entry
  // matched the device (the "identified" state) for the per-slave lazy load.
  private buildIdentSpecsList(specModbus: ImodbusSpecification | undefined): IidentificationSpecification[] {
    const rci: IidentificationSpecification[] = []
    if (!this.preparedSpecs || !this.config) return rci
    this.preparedSpecs.forEach((spec) => {
      const name = getSpecificationI18nName(spec, this.config!.mqttdiscoverylanguage)
      rci.push({
        name: name,
        identified: specModbus && spec.filename == specModbus.filename ? specModbus.identified : IdentifiedStates.unknown,
        filename: spec.filename,
        status: spec.status,
      } as IidentificationSpecification)
    })
    return rci
  }
  // Recompute the shared dropdown fallback list and the per-card labels once the pieces they
  // depend on (config, preparedSpecs) have arrived. Called from the parallel load callbacks so
  // slave cards can render immediately and get their real names/options filled in a moment later.
  private refreshSpecDerivedState(): void {
    if (this.preparedSpecs && this.config) this.preparedIdentSpecs = this.buildIdentSpecsList(undefined)
    this.uiSlaves.forEach((u) => (u.label = this.getSlaveName(u.slave)))
  }
  // Command topics and selected entities need config + bus + the slave's loaded specification.
  // Because the cards now render before getBus/getConfiguration resolve, fill them here too so a
  // slave whose specification loaded before bus/config still gets its command topics (the
  // addSpecificationToUiSlave callback covers the opposite ordering).
  private refreshLoadedSlaveDetails(): void {
    if (!this.config || !this.bus) return
    this.uiSlaves.forEach((u) => {
      if (u.slave.specification) {
        u.selectedEntitites = this.getSelectedEntites(u.slave)
        this.fillCommandTopics(u)
      }
    })
  }
  // Lazily fetch the per-slave modbus identification (one device read) the first time the
  // specification dropdown is opened. Until then the dropdown renders the cheap, shared
  // preparedIdentSpecs fallback, so the initial page load stays fast with many slaves.
  loadIdentSpecs(uiSlave: IuiSlave): void {
    if (uiSlave.identSpecsLoaded || !uiSlave.specsObservable) return
    uiSlave.identSpecsLoaded = true
    this.getIdentSpecs(uiSlave)
      .then((identSpecs) => uiSlave.specsObservable!.next(identSpecs))
      .catch((e) => console.log(e.message))
  }
  private getUiSlave(slave: Islave, _detectSpec: boolean | undefined): IuiSlave {
    const fg = this.initiateSlaveControl(slave, null)
    const rc: IuiSlave = {
      slave: slave,
      label: this.getSlaveName(slave),
      slaveForm: fg,
    } as any
    // ReplaySubject(1) so the template's `| async` receives the spec list even when
    // loadIdentSpecs() resolves (microtask) before Angular subscribes via change detection.
    // A plain Subject would drop that early emission, leaving the dropdown empty.
    // The subject stays empty on load so the template falls back to the cheap, network-free
    // preparedIdentSpecs list. The per-slave modbus identification is fetched lazily on first
    // dropdown open (loadIdentSpecs) to keep the initial page load free of N device reads.
    rc.specsObservable = new ReplaySubject<IidentificationSpecification[]>(1)
    // Under zoneless CD the HTTP push body preview cannot be a template method call reading live
    // form values (nothing re-evaluates it). Drive a signal from the form's valueChanges instead so
    // selecting push entities or editing the root updates the preview immediately.
    rc.httpPushBody = signal<string | undefined>(this.getHttpPushBody(rc))
    this.subscriptions.push(fg.valueChanges.subscribe(() => rc.httpPushBody!.set(this.getHttpPushBody(rc))))
    this.addSpecificationToUiSlave(rc, () => {
      rc.selectedEntitites = this.getSelectedEntites(slave)
      this.fillCommandTopics(rc)
      // slave2Form computed this synchronously before the specification was fetched
      // (slaves arrive without an embedded specification) — recompute now that it's here.
      fg.get('discoverEntitiesList')!.setValue(this.buildDiscoverEntityList(slave))
      // Recompute now that the specification (and thus entity list) is available.
      rc.httpPushBody!.set(this.getHttpPushBody(rc))
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
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  showUnmatched() {
    this.showAllPublicSpecs.value
    if (this.bus) this.updateSlaves(this.bus.busId)
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
    fg.get('pollSchedule')!.setValue(slave.pollSchedule ?? null)
    fg.get('pollSchedulePreset')!.setValue(this.presetForSchedule(slave.pollSchedule))
    fg.get('pollMode')!.setValue(slave.pollMode == undefined ? PollModes.intervall : slave.pollMode)
    fg.get('qos')!.setValue(slave.qos ? slave.qos : -1)
    fg.get('noDiscovery')!.setValue(slave.noDiscovery ? slave.noDiscovery : false)
    fg.get('configurationUrl')!.setValue(slave.configurationUrl ? slave.configurationUrl : null)
    fg.get('discoverEntitiesList')!.setValue(this.buildDiscoverEntityList(slave))
    if (slave.noDiscovery) fg.get('discoverEntitiesList')!.disable()
    else fg.get('discoverEntitiesList')!.enable()
    fg.get('httpPushUrl')!.setValue(slave.httpPush?.url ?? null)
    fg.get('httpPushPat')!.setValue(null) // never prefill the PAT into the form
    fg.get('httpPushRoot')!.setValue(slave.httpPush?.root ?? null)
    fg.get('pushEntitiesList')!.setValue(slave.httpPush?.pushEntities ?? [])
  }

  initiateSlaveControl(slave: Islave, defaultValue: IidentificationSpecification | null): FormGroup {
    if (slave.slaveid >= 0) {
      const fg = this._formBuilder.group({
        hiddenSlaveId: [slave.slaveid],
        specificationid: [defaultValue],
        name: [slave.name],
        pollInterval: [slave.pollInterval],
        pollSchedule: [slave.pollSchedule, SelectSlaveComponent.cronFormatValidator],
        pollSchedulePreset: [this.presetForSchedule(slave.pollSchedule)],
        pollMode: [slave.pollMode],
        qos: [slave.qos],
        rootTopic: [slave.rootTopic],
        showUrl: [false],
        noDiscovery: [false],
        configurationUrl: [slave.configurationUrl],
        discoverEntitiesList: [[]],
        httpPushUrl: [slave.httpPush?.url],
        httpPushPat: [null as string | null],
        httpPushRoot: [slave.httpPush?.root],
        pushEntitiesList: [[] as number[]],
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
          if (this.bus) this.updateSlaves(this.bus.busId)
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
  hasHttpPushPat(uiSlave: IuiSlave): boolean {
    return (uiSlave.slave.httpPush as any)?.hasPat === true
  }
  private applyHttpPush(uiSlave: IuiSlave) {
    const url: string | null = uiSlave.slaveForm.get('httpPushUrl')!.value
    const pat: string | null = uiSlave.slaveForm.get('httpPushPat')!.value
    const root: string | null = uiSlave.slaveForm.get('httpPushRoot')!.value
    const pushEntities: number[] = uiSlave.slaveForm.get('pushEntitiesList')!.value ?? []
    if (url && url.length > 0) {
      // pat is only sent when newly entered; backend keeps the stored PAT otherwise.
      const httpPush: any = { url, pushEntities }
      if (pat && pat.length > 0) httpPush.pat = pat
      if (root && root.length > 0) httpPush.root = root
      uiSlave.slave.httpPush = httpPush
    } else {
      delete uiSlave.slave.httpPush
    }
  }
  saveSlave(uiSlave: IuiSlave) {
    SelectSlaveComponent.controllers.forEach((controller) => {
      SelectSlaveComponent.form2SlaveSetValue(uiSlave, controller)
    })
    this.applyHttpPush(uiSlave)
    // pollSchedule (cron) overrides pollInterval on the backend; store undefined when left empty.
    const pollSchedule: string | null = uiSlave.slaveForm.get('pollSchedule')!.value
    uiSlave.slave.pollSchedule = pollSchedule && pollSchedule.trim().length > 0 ? pollSchedule.trim() : undefined
    const spec: IidentificationSpecification = uiSlave.slaveForm.get('specificationid')!.value
    const selectedEntities: number[] = uiSlave.slaveForm.get('discoverEntitiesList')!.value
    if (spec && spec.filename) {
      uiSlave.slave.specificationid = spec.filename
      this.addSpecificationToUiSlave(uiSlave, () => {
        uiSlave.slave.noDiscoverEntities = []
        if (selectedEntities && uiSlave.slave.specification) {
          ;(uiSlave.slave.specification as Ispecification).entities.forEach((e: IidentEntity) => {
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
  // Stable empty-status singleton so a slave without modbus status returns the SAME
  // reference on every change-detection cycle. Returning a fresh object literal (as before)
  // fed a new @Input into <app-modbus-error> each cycle, forcing it to re-render forever.
  private static readonly emptyModbusStatus: ImodbusStatusForSlave = {
    requestCount: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    errors: [],
    queueLength: 0,
  }
  getModbusErrors(uiSlave: IuiSlave): ImodbusStatusForSlave | undefined {
    if (!uiSlave || !uiSlave.slave || !uiSlave.slave.modbusStatusForSlave)
      return SelectSlaveComponent.emptyModbusStatus
    return uiSlave.slave.modbusStatusForSlave
  }
}
