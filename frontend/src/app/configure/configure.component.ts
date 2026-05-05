import { OnInit, Component, EventEmitter, Output } from '@angular/core'
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  Validators,
  FormsModule,
  ReactiveFormsModule,
  ValidatorFn,
  ValidationErrors,
  FormGroup,
} from '@angular/forms'
import { ApiService } from '../services/api-service'
import { Iconfiguration, IUserAuthenticationStatus } from '@shared/server'
import { Observable } from 'rxjs'
import { ActivatedRoute, Router } from '@angular/router'
import { MatOption } from '@angular/material/core'
import { MatSelect } from '@angular/material/select'
import { NgClass } from '@angular/common';
import { MatInput } from '@angular/material/input'
import { MatFormField, MatLabel, MatError, MatHint } from '@angular/material/form-field'
import { MatStepLabel } from '@angular/material/stepper'
import { MatIcon } from '@angular/material/icon'
import { MatTooltip } from '@angular/material/tooltip'
import { MatIconButton } from '@angular/material/button'
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card'

// Let's Encrypt convention (also used by Home Assistant)
const DEFAULT_CA_FILE = 'chain.pem'
const DEFAULT_CERT_FILE = 'cert.pem'
const DEFAULT_KEY_FILE = 'privkey.pem'

@Component({
  selector: 'app-configure',
  templateUrl: './configure.component.html',
  styleUrls: ['./configure.component.css'],
  imports: [
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    FormsModule,
    ReactiveFormsModule,
    MatIconButton,
    MatTooltip,
    MatIcon,
    MatStepLabel,
    MatFormField,
    MatLabel,
    MatInput,
    MatError,
    MatHint,
    MatSelect,
    MatOption,
    NgClass
],
  standalone: true,
})
export class ConfigureComponent implements OnInit {
  config: Iconfiguration | undefined = undefined
  @Output() isMqttConfiguredEvent = new EventEmitter<boolean>()
  readonly defaultCaFile = DEFAULT_CA_FILE
  readonly defaultCertFile = DEFAULT_CERT_FILE
  readonly defaultKeyFile = DEFAULT_KEY_FILE

  constructor(
    private _formBuilder: FormBuilder,
    private entityApiService: ApiService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.ghPersonalAccessToken = _formBuilder.control([''])
    this.debugComponentsFormControl = _formBuilder.control([''])
    this.configObservable = this.entityApiService.getConfiguration()
    this.configureMqttFormGroup = this._formBuilder.group({
      mqttserverurl: [null as string | null, this.requiredInNonAddonScenario],
      mqttuser: [null as string | null],
      mqttpassword: [null as string | null],
      mqttcafile: [null as string | null],
      mqttcertfile: [null as string | null],
      mqttkeyfile: [null as string | null],
    })
  }
  private requiredInNonAddonScenario: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    {
      if (this.authStatus && !this.authStatus.hassiotoken) return Validators.required(control)
      else return null
    }
  }
  saveDisabled() {
    // connected or empty serverurl value

    return (
      (this.mqttConnectIcon != 'cast_connected' && this.authStatus && !this.authStatus.hassiotoken) ||
      (this.configureMqttFormGroup.pristine &&
        this.ghPersonalAccessToken.pristine &&
        this.debugComponentsFormControl.pristine &&
        this.discoveryLanguageFormControl.pristine)
    )
  }
  configObservable: Observable<Iconfiguration>
  sslFiles: string[] = []
  mqttConnectIcon: string = 'cast'
  mqttConnectClass: string = 'redIcon'
  mqttConnectMessage: string = 'unknown'
  authStatus: IUserAuthenticationStatus | undefined = undefined
  configureMqttFormGroup: FormGroup
  ghPersonalAccessToken: FormControl
  debugComponentsFormControl: FormControl
  discoveryLanguageFormControl = new FormControl<string | null>(null)
  connectMessage: string = ''
  ngOnInit(): void {
    this.configObservable.subscribe((config) => {
      this.config = config
      if (config.mqttconnect.mqttserverurl) {
        this.configureMqttFormGroup.get('mqttserverurl')!.setValue(config.mqttconnect.mqttserverurl)
      }
      if (config.mqttconnect.username) {
        this.configureMqttFormGroup.get('mqttuser')!.setValue(config.mqttconnect.username)
      }
      if (config.mqttconnect.password) {
        this.configureMqttFormGroup.get('mqttpassword')!.setValue(config.mqttconnect.password as string)
      }
      if (config.mqttdiscoverylanguage) {
        this.discoveryLanguageFormControl!.setValue(config.mqttdiscoverylanguage)
      }
      if (config.mqttcaFile) {
        this.configureMqttFormGroup.get('mqttcafile')!.setValue(config.mqttcaFile)
      }
      if (config.mqttcertFile) {
        this.configureMqttFormGroup.get('mqttcertfile')!.setValue(config.mqttcertFile)
      }
      if (config.mqttkeyFile) {
        this.configureMqttFormGroup.get('mqttkeyfile')!.setValue(config.mqttkeyFile)
      }
      if (config.debugComponents) {
        this.debugComponentsFormControl!.setValue(config.debugComponents)
      }

      this.entityApiService.getSslFiles().subscribe((rc) => {
        this.sslFiles = rc
        this.applyMtlsDefaultsIfAllPresent(config)
      })
      this.entityApiService.getUserAuthenticationStatus().subscribe((authStatus) => {
        this.authStatus = authStatus
        this.mqttValidate()
        if (config.githubPersonalToken) this.ghPersonalAccessToken.setValue(config.githubPersonalToken)
      })
    })
  }
  form2Config(form: AbstractControl, config: Iconfiguration) {
    const mqttserverurl = form.get('mqttserverurl')
    const mqttuser = form.get('mqttuser')
    const mqttpassword = form.get('mqttpassword')
    const mqttcafile = form.get('mqttcafile')
    const mqttcertfile = form.get('mqttcertfile')
    const mqttkeyfile = form.get('mqttkeyfile')
    // Save changes to Config and Device
    if (config && mqttserverurl && mqttuser && mqttpassword && mqttserverurl.value) {
      {
        if (!config.mqttconnect) config.mqttconnect = {}
        config.mqttconnect.mqttserverurl = mqttserverurl.value!
        config.mqttconnect.username = mqttuser.value!
        config.mqttconnect.password = mqttpassword.value!
        if (this.discoveryLanguageFormControl && this.discoveryLanguageFormControl.value!)
          config.mqttdiscoverylanguage = this.discoveryLanguageFormControl.value!
        if (mqttcafile) config.mqttcaFile = mqttcafile.value ? mqttcafile.value : undefined
        else delete config.mqttcaFile
        if (mqttcertfile) config.mqttcertFile = mqttcertfile.value ? mqttcertfile.value : undefined
        else delete config.mqttcertFile
        if (mqttkeyfile) config.mqttkeyFile = mqttkeyfile.value ? mqttkeyfile.value : undefined
        else delete config.mqttkeyFile
        if (config.debugComponents) config.debugComponents = this.debugComponentsFormControl!.value
      }
    }
  }

  private applyMtlsDefaultsIfAllPresent(config: Iconfiguration) {
    const allPresent =
      this.sslFiles.includes(DEFAULT_CA_FILE) &&
      this.sslFiles.includes(DEFAULT_CERT_FILE) &&
      this.sslFiles.includes(DEFAULT_KEY_FILE)
    if (!allPresent) return
    const ca = this.configureMqttFormGroup.get('mqttcafile')
    const cert = this.configureMqttFormGroup.get('mqttcertfile')
    const key = this.configureMqttFormGroup.get('mqttkeyfile')
    if (ca && !ca.value && !config.mqttcaFile) ca.setValue(DEFAULT_CA_FILE)
    if (cert && !cert.value && !config.mqttcertFile) cert.setValue(DEFAULT_CERT_FILE)
    if (key && !key.value && !config.mqttkeyFile) key.setValue(DEFAULT_KEY_FILE)
  }

  onChangekMqttConfig() {
    this.mqttValidate()
  }
  onChangeGithubToken() {}
  getSslFiles(): Observable<string[]> {
    return this.entityApiService.getSslFiles()
  }

  save() {
    if (this.config == undefined) return
    this.form2Config(this.configureMqttFormGroup, this.config)
    if (this.ghPersonalAccessToken && this.ghPersonalAccessToken.value.length > 0)
      this.config.githubPersonalToken = this.ghPersonalAccessToken.value
    if (this.debugComponentsFormControl && this.debugComponentsFormControl.value.length > 0)
      this.config.debugComponents = this.debugComponentsFormControl.value
    this.entityApiService.postConfiguration(this.config).subscribe(() => {
      this.close()
    })
    this.close()
  }

  close() {
    this.router.navigate(['/'])
  }

  hasConfigChanges(): boolean {
    return !this.configureMqttFormGroup.pristine || !this.configureMqttFormGroup.pristine
  }
  isMqttConfigComplete(): boolean {
    this.configureMqttFormGroup.updateValueAndValidity()
    return this.configureMqttFormGroup.valid
  }
  mqttValidate(): void {
    const config: Iconfiguration = {} as unknown as Iconfiguration
    this.form2Config(this.configureMqttFormGroup, config)
    this.entityApiService.postValidateMqtt(config).subscribe((result) => {
      const hassio = this.authStatus != undefined && this.authStatus.hassiotoken
      if (result && result.valid) {
        this.mqttConnectIcon = 'cast_connected'
        this.mqttConnectClass = 'greenIcon'
        this.mqttConnectMessage = 'connected'
      } else {
        this.mqttConnectIcon = 'cast'
        this.mqttConnectClass = hassio ? 'greenIcon' : 'redIcon'
        let message = result.message
        if (hassio) message = message + '\nModbus <=> MQTT uses Home Assistants MQTT connection parameters'
        this.mqttConnectMessage = !result || !result.message ? 'error' : message
      }
    })
  }
}
