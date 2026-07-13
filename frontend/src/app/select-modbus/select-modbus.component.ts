import { AfterViewInit, Component, Input, OnDestroy, ViewChild } from '@angular/core'
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms'
import { Clipboard } from '@angular/cdk/clipboard'
import { MatSelectionList } from '@angular/material/list'
import { ApiService } from '../services/api-service'
import { MatTableDataSource } from '@angular/material/table'
import { IBus, IModbusConnection, IRTUConnection, ITCPConnection, getBusName, getConnectionName } from '@shared/server'
import { MatSelectChange, MatSelect } from '@angular/material/select'
import { ActivatedRoute, Router } from '@angular/router'
import { Observable, Subscription } from 'rxjs'
import { MatTabChangeEvent, MatTabGroup, MatTab } from '@angular/material/tabs'
import { BUS_TIMEOUT_DEFAULT } from '@shared/specification'
import { MatOption } from '@angular/material/core'
import { MatInput } from '@angular/material/input'
import { MatFormField, MatLabel } from '@angular/material/form-field'
import { MatIcon } from '@angular/material/icon'
import { MatIconButton } from '@angular/material/button'
import { MatTooltip } from '@angular/material/tooltip'
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card'

@Component({
  selector: 'app-select-modbus',
  templateUrl: './select-modbus.component.html',
  styleUrls: ['./select-modbus.component.css'],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatTooltip,
    MatIconButton,
    MatIcon,
    MatCardContent,
    MatTabGroup,
    MatTab,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelect,
    MatOption,
  ],
})
export class SelectModbusComponent implements AfterViewInit, OnDestroy {
  constructor(
    private _formBuilder: FormBuilder,
    private entityApiService: ApiService,
    private route: ActivatedRoute,
    private routes: Router,
    private clipBoard: Clipboard
  ) {
    this._formBuilder.array([])
    this.bussesObservable = this.entityApiService.getBusses()
    this.bussesFormArray = this._formBuilder.array([])
    this.configureModbusFormGroup = this._formBuilder.group({
      bussesFormArray: this.bussesFormArray,
    })
  }
  displayedBusIdColumns: string[] = ['select', 'busid', 'connectionData', 'deviceCount']
  busname: string | undefined = undefined
  paramSubscription: Subscription | undefined = undefined
  serialDevices: string[] = []
  bussesFormArray: FormArray
  configureModbusFormGroup: FormGroup
  modbusIsRtu: boolean[] = []
  busses: MatTableDataSource<IBus> = new MatTableDataSource<IBus>([])
  bussesObservable: Observable<IBus[]>
  baudRates: Array<number> = [2400, 4800, 9600, 11200, 115700]
  selectedBaudRate: number | undefined = undefined
  @ViewChild('selectBaudRate') selectBaudRate: MatSelectionList | undefined
  @Input() preselectedBusId: number | undefined = undefined

  uniqueConnectionDataValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    {
      if (this && this.busses && this.busses.data)
        return !this.busses.data.find((bus) => (bus.connectionData as IRTUConnection).serialport == control.value)
          ? null
          : { unique: control.value }
      return null
    }
  }

  ngAfterViewInit(): void {
    this.entityApiService.getSerialDevices().subscribe((devices) => {
      this.serialDevices = devices
      this.readBussesFromServer()
    })
    this.paramSubscription = this.route.queryParams.subscribe((params) => {
      if (params['busid'] != undefined) {
        this.preselectedBusId = params['busid']
      }
    })
  }
  ngOnDestroy(): void {
    if (this.paramSubscription) this.paramSubscription.unsubscribe()
  }

  getConnectionName(bus: IBus): string {
    return getConnectionName(bus.connectionData)
  }
  readBussesFromServer(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.bussesObservable.subscribe((results) => {
        ;(results as (IBus | null)[]).push(null)
        this.busses.data = results
        if (this.bussesFormArray != undefined) {
          this.bussesFormArray.clear()
          this.modbusIsRtu = []
        }
        for (let idx = 0; idx < results.length; idx++) this.copyBus2Form(idx)
        this.modbusIsRtu.push(true)
        this.bussesFormArray.push(this.createConnectionDataFormGroup())
        resolve()
      })
    })
  }
  copyBus2Form(idx: number) {
    if (this.busses.data.length > idx && this.busses.data[idx] != null) {
      const bus = this.busses.data[idx]
      const isRtu = (bus.connectionData as IRTUConnection).serialport != undefined
      let fg = this.createConnectionDataFormGroup()
      if (this.bussesFormArray.at(idx) != undefined) fg = this.bussesFormArray.at(idx) as FormGroup
      else {
        this.bussesFormArray.push(fg)
        this.modbusIsRtu.push(isRtu)
      }
      if (isRtu) {
        const serialport = (bus.connectionData as IRTUConnection).serialport
        const baudRate = (bus.connectionData as IRTUConnection).baudrate
        const timeout = (bus.connectionData as IRTUConnection).timeout
        const tcpBridgePort = (bus.connectionData as IRTUConnection).tcpBridgePort

        const sd = this.getBusFormGroup(idx).get(['rtu', 'serial']) as FormControl<string>
        sd.setValue(serialport)

        const br = fg.get(['rtu', 'selectBaudRate'])
        if (br) br.setValue(baudRate)
        const to = fg.get(['rtu', 'timeout'])
        if (to) to.setValue(timeout)
        const tbp = fg.get(['rtu', 'tcpBridgePort'])
        if (tbp) tbp.setValue(tcpBridgePort ?? null)
      } else {
        const host = (bus.connectionData as ITCPConnection).host
        const port = (bus.connectionData as ITCPConnection).port
        const timeout = (bus.connectionData as ITCPConnection).timeout
        const sd = fg.get(['tcp', 'host'])
        if (sd) sd.setValue(host)
        const br = fg.get(['tcp', 'port'])
        if (br) br.setValue(port)
        const to = fg.get(['tcp', 'timeout'])
        if (to) to.setValue(timeout)
      }
    }
  }
  getBusFormGroup(index: number): FormGroup {
    const fg = (this.configureModbusFormGroup.get('bussesFormArray') as FormArray).at(index) as FormGroup
    if (fg == undefined) return this.createConnectionDataFormGroup()
    return fg
  }
  cancelBus(idx: number): void {
    this.bussesFormArray.at(idx).markAsUntouched()
    this.copyBus2Form(idx)
  }
  needsSaving(idx: number): boolean {
    const fg = this.bussesFormArray.at(idx)
    return fg == undefined || fg.touched
  }
  saveBus(idx: number): Promise<number> {
    return new Promise<number>((resolve) => {
      const connection = this.copyForm2Connection(idx)

      const busid: number | undefined = null != this.busses.data[idx] ? this.busses.data[idx].busId : undefined

      this.entityApiService.postBus(connection, busid).subscribe((b) => {
        if (busid == undefined) {
          // New bus was added
          this.readBussesFromServer()
        } else {
          resolve(b.busid)
          this.bussesFormArray.at(idx).markAsUntouched()
        }
      })
    })
  }
  copyForm2Connection(idx: number): IModbusConnection {
    let timeout: FormControl | null = null
    let baudrate: FormControl | null = null
    let host: FormControl | null = null
    let port: FormControl | null = null
    let serial: FormControl | null = null
    const fg: FormGroup = this.bussesFormArray.at(idx)! as FormGroup
    const connectionData: IModbusConnection = this.busses.data[idx]
      ? this.busses.data[idx].connectionData
      : ({} as IModbusConnection)
    if (fg) {
      if (this.modbusIsRtu[idx]) {
        if (
          null != (timeout = fg.get(['rtu', 'timeout']) as FormControl) &&
          null != (baudrate = fg.get(['rtu', 'selectBaudRate']) as FormControl) &&
          null != (serial = fg.get(['rtu', 'serial']) as FormControl)
        ) {
          ;(connectionData as IRTUConnection).baudrate = baudrate.value
          ;(connectionData as IRTUConnection).serialport = serial.value
          ;(connectionData as IRTUConnection).timeout = timeout.value
        }
        // Optional BridgePort
        const tcpBridgePort = fg.get(['rtu', 'tcpBridgePort']) as FormControl
        if (tcpBridgePort) {
          const portValue = tcpBridgePort.value
          if (portValue !== null && portValue !== undefined && String(portValue).trim() !== '') {
            const parsedPort = Number(portValue)
            if (!Number.isNaN(parsedPort)) (connectionData as IRTUConnection).tcpBridgePort = parsedPort
          } else {
            delete (connectionData as IRTUConnection).tcpBridgePort
          }
        }

        delete (connectionData as any).tcpBridge

        delete (connectionData as any).host
        delete (connectionData as any).port
      } else {
        if (
          undefined != (host = fg.get(['tcp', 'host']) as FormControl) &&
          undefined != (timeout = fg.get(['tcp', 'timeout']) as FormControl) &&
          undefined != (port = fg.get(['tcp', 'port']) as FormControl)
        ) {
          ;(connectionData as ITCPConnection).host = host.value
          ;(connectionData as ITCPConnection).port = port.value
          ;(connectionData as ITCPConnection).timeout = timeout.value
        }
        delete (connectionData as any).serialport
        delete (connectionData as any).baudrate
      }
    }
    return connectionData
  }

  stringCompare(o1: any, o2: any): boolean {
    return (o1 as string) === (o2 as string)
  }
  getSerialDevices(_bus: IBus | null): string[] {
    // Remove serialport names, which are already configured
    const devices = structuredClone(this.serialDevices)
    let didx
    for (didx = 0; didx < devices.length; ) {
      const sd = devices[didx]
      const idx = this.busses.data.findIndex(
        (b) =>
          b != null &&
          (b.connectionData as IRTUConnection).serialport &&
          (b.connectionData as IRTUConnection).serialport == sd &&
          (_bus == null || sd != (_bus.connectionData as IRTUConnection).serialport)
      )
      if (idx != -1) devices.splice(didx, 1)
      else didx++
    }
    return devices
  }

  isRTU(idx: number): boolean {
    return this.modbusIsRtu[idx]
  }
  checkConfigRTU(): boolean {
    return false //this.config !== undefined && this.config.connectionData[0].baudrate == undefined
  }
  private serialValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    return this.serialDevices.length == 0 && (!control.value || control.value.length == 0) ? { 'not empty': control.value } : null
  }
  private serialDevicesValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    return this.serialDevices.length > 0 && (!control.value || control.value.length == 0) ? { 'not empty': control.value } : null
  }
  createConnectionDataFormGroup(): FormGroup {
    const fg = this._formBuilder.group({
      selectedBusTab: this._formBuilder.control(0),
      rtu: this._formBuilder.group({
        serial: [null, this.serialValidator],
        selectBaudRate: [9600, Validators.required],
        timeout: [BUS_TIMEOUT_DEFAULT, Validators.required],
        tcpBridgePort: [null],
      }),
      tcp: this._formBuilder.group({
        host: ['', Validators.required],
        port: [502, Validators.required],
        timeout: [BUS_TIMEOUT_DEFAULT, Validators.required],
      }),
    })
    return fg
  }
  hasRtuError(error: string): boolean {
    return this.configureModbusFormGroup.get('rtu')!.hasError(error)
  }
  addEnabled(idx: number) {
    const fg = this.bussesFormArray.at(idx)
    if (fg)
      if (this.isRTU(idx)) return fg.get('rtu')!.valid
      else return fg.get('tcp')!.valid
    return false
  }
  copy2Serial(idx: number, event: MatSelectChange) {
    const fg = this.getBusFormGroup(idx)
    fg.get('serial')!.setValue(event.value)
  }

  getBusName(bus: IBus): string {
    if (bus == null) return 'New'
    return getBusName(bus)
  }
  deleteBus(bus: IBus) {
    if (
      bus.slaves.length == 0 ||
      confirm('There is/are ' + bus.slaves.length + ' slaves configured. Are you sure to delete it/them?')
    ) {
      this.entityApiService.deleteBus(bus.busId).subscribe(() => {
        this.readBussesFromServer()
      })
    }
  }

  canDeleteRow(bus: IBus): boolean {
    return bus.slaves.length > 0
  }

  selectedTypeChanged($event: MatTabChangeEvent, index: number) {
    this.modbusIsRtu[index] = $event.index == 0
  }

  getSerialFormControl(idx: number): FormControl<string> {
    const busFormGroup = this.getBusFormGroup(idx)
    let s: FormControl<string> = busFormGroup.get(['rtu', 'serial'])! as FormControl<string>
    if (s == null) s = busFormGroup.get(['rtu', 'serialDeviceSelection'])! as FormControl<string>
    return s
  }

  getConnectionTitle(idx: number): string {
    const busFormGroup = this.getBusFormGroup(idx)
    this.busses.data
    let s: FormControl<string> | undefined = undefined
    if (this.modbusIsRtu[idx]) s = this.getSerialFormControl(idx)
    else s = busFormGroup.get(['tcp', 'host'])! as FormControl<string>
    return s != undefined && s.value ? s.value : 'New'
  }

  isSelectedBaudRate(br: number): boolean {
    return this.selectedBaudRate !== undefined && br == this.selectedBaudRate
  }

  listSlaves(idx: number) {
    this.saveBus(idx).then((busid) => {
      this.readBussesFromServer().then(() => {
        this.routes.navigate(['/slaves', busid])
      })
    })
  }
}
