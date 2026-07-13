import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core'
import { Observable, Subscription } from 'rxjs'
import {
  IUpdatei18nText,
  Imessage,
  ImodbusSpecification,
  Iselect,
  VariableTargetParameters,
  getParameterType,
  getSpecificationI18nText,
  setSpecificationI18nText,
  validateTranslation,
} from '@shared/specification'
import { ApiService } from '../../services/api-service'
import { AbstractControl, FormControl, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ISpecificationMethods } from '../../services/specificationInterface'
import { HttpErrorResponse } from '@angular/common/http'
import { I18nService } from '../../services/i18n.service'
import { CdkTextareaAutosize } from '@angular/cdk/text-field'
import { MatInput } from '@angular/material/input'
import { MatFormField, MatLabel } from '@angular/material/form-field'
import { MatButton } from '@angular/material/button'
import { MatSlideToggle } from '@angular/material/slide-toggle'
import { MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle } from '@angular/material/expansion'
import { NgClass } from '@angular/common'

@Component({
  selector: 'app-translation',
  templateUrl: './translation.component.html',
  styleUrls: ['./translation.component.css'],
  standalone: true,
  imports: [
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    NgClass,
    MatSlideToggle,
    FormsModule,
    ReactiveFormsModule,
    MatButton,
    MatFormField,
    MatInput,
    CdkTextareaAutosize,
    MatLabel,
  ],
})
export class TranslationComponent implements OnInit, OnDestroy {
  @Input()
  specificationObservable: Observable<ImodbusSpecification | null> | null = null
  specificationSubscription: Subscription | undefined = undefined
  @Input({ required: true })
  specificationFormGroup: FormGroup | undefined = undefined

  @Output()
  updateI18n = new EventEmitter<IUpdatei18nText>()
  @Input()
  mqttdiscoverylanguage: string = 'en'
  @Input({ required: true })
  specificationMethods: ISpecificationMethods | undefined
  languageToggle: boolean = false
  currentSpecification: ImodbusSpecification | undefined
  supportsGoogleTranslate: boolean = true
  allKeys: string[] = []
  originalLanguages: string[] = []
  translatedLanguages: string[] = []
  translationFormGroupInitialized: boolean = false
  googleTranslateWindow: Window | null = null
  constructor(private entityApiService: ApiService) {}

  translationFormGroup: FormGroup = new FormGroup({})
  originalLanguage: string = 'en'
  translationLanguage: string = 'en'
  textBuffer: string[] = []
  ids: string[] = []

  ngOnInit() {
    if (this.mqttdiscoverylanguage != 'en') {
      this.specificationFormGroup && this.specificationFormGroup.setControl('translation', this.translationFormGroup)
    }

    this.translationFormGroup.addControl('name', new FormControl<string | null>(null))
    if (this.specificationObservable)
      this.specificationSubscription = this.specificationObservable.subscribe((_specFromParent) => {
        if (_specFromParent) this.currentSpecification = _specFromParent
        else return

        if (this.mqttdiscoverylanguage != 'en') {
          const dql = this.currentSpecification.i18n.find((langStruct) => langStruct.lang == this.mqttdiscoverylanguage)
          const en = this.currentSpecification.i18n.find((langStruct) => langStruct.lang == 'en')
          if (en) this.languageToggle = dql != undefined
          else this.languageToggle = true
        }
        this.reloadTexts()
      })
  }
  onLanguageToggle() {
    this.languageToggle = !this.languageToggle
    this.reloadTexts()
  }
  private addOrUpdateControl(textId: string) {
    if (this.currentSpecification == undefined) return
    const text = getSpecificationI18nText(this.currentSpecification, this.translationLanguage, textId, true)
    const control = this.translationFormGroup.get(textId)

    if (!control) this.translationFormGroup.setControl(textId, new FormControl<string | null>(text, Validators.required))
    else control.setValue(text)
  }
  reloadTexts() {
    if (this.languageToggle) {
      this.originalLanguage = this.mqttdiscoverylanguage
      this.translationLanguage = 'en'
    } else {
      this.originalLanguage = 'en'
      this.translationLanguage = this.mqttdiscoverylanguage
    }
    this.addOrUpdateControl('name')

    this.fillLanguages()
    for (const key of this.getAllKeys()) {
      try {
        this.addOrUpdateControl(key)
        const oKeys = this.getOptionKeys(key)
        oKeys.forEach((optionKey) => {
          this.addOrUpdateControl(optionKey)
        })
        for (const field in this.translationFormGroup.controls) {
          // 'field' is a string
          if (field.startsWith(key) && field != key && !oKeys.includes(field)) this.translationFormGroup.removeControl(field)
        }
      } catch (_e) {
        void _e
      }
      this.translationFormGroup.updateValueAndValidity()

      this.translationFormGroupInitialized = true
    }
  }

  getLanguageName(lang: string): string {
    return I18nService.getLanguageName(lang)
  }
  showTranslation(): boolean {
    // en should always be availabe. The discovery language is al
    if (!this.currentSpecification || null == this.currentSpecification.i18n.find((l) => l.lang == 'en')) return true
    const msgs: Imessage[] = []

    // If the discovery language is not available, the translation dialog should be visible.
    if (null == this.currentSpecification.i18n.find((l) => l.lang == this.mqttdiscoverylanguage)) return true
    // Check translation for completeness
    validateTranslation(this.currentSpecification, this.mqttdiscoverylanguage, msgs)
    return msgs.length > 0
  }
  fillLanguages() {
    this.originalLanguages = []
    this.translatedLanguages = []
    if (this.currentSpecification)
      this.currentSpecification.i18n.forEach((l) => {
        this.originalLanguages.push(l.lang)
      })
    else {
      this.originalLanguages.push('en')
    }
  }
  ngOnDestroy(): void {
    if (this.specificationSubscription) this.specificationSubscription.unsubscribe()
  }
  getKeyType(key: string): string {
    return key == 'name' ? 'Spec' : 'Entity'
  }
  getOriginalText(key: string): string {
    if (!this.currentSpecification) return ''
    return getSpecificationI18nText(this.currentSpecification, this.originalLanguage, key, true)!
  }
  changeText(key: string): void {
    const textFc = this.translationFormGroup.get(key)
    if (textFc && this.currentSpecification) {
      const text = textFc.value
      setSpecificationI18nText(this.currentSpecification, this.translationLanguage, key, text)
      this.translationFormGroup.updateValueAndValidity()
      this.updateI18n.emit({ key: key, i18n: this.currentSpecification.i18n })
    }
  }
  translatedText(key: string): string | null {
    if (!this.currentSpecification) return null
    return getSpecificationI18nText(this.currentSpecification, this.translationLanguage, key, true)
  }
  getAllKeys(): string[] {
    const rc: string[] = []
    if (this.currentSpecification)
      this.currentSpecification.entities.forEach((ent) => {
        if (!ent.variableConfiguration || ent.variableConfiguration.targetParameter <= VariableTargetParameters.deviceIdentifiers)
          rc.push('e' + ent.id)
      })

    return rc
  }
  errorHandler(err: HttpErrorResponse): boolean {
    if (err.status == 406) {
      // Forward to translation
      this.supportsGoogleTranslate = false
      this.googleTranslate()
      return true
    }
    return false
  }
  translatedValuesPasted(event: Event) {
    if (event && event.target) {
      const text: string | null = (event.target as HTMLTextAreaElement).value
      if (text) {
        const texts: string[] = text.split('\n')
        this.copyTranslations2Form(texts)
        ;(event.target as HTMLTextAreaElement).value = ''
      }
    }
  }
  needsTranslation(): boolean {
    this.generateTranslationTexts()
    return this.ids.length > 0
  }
  copyTranslations2Form(texts: string[]) {
    const ids = structuredClone(this.ids)
    let text: string | undefined = texts.pop()
    let id: string | undefined = ids.pop()
    while (text && id) {
      let c: AbstractControl | null
      if (null != (c = this.translationFormGroup.get([id]))) {
        c.setValue(text)
        this.changeText(id)
      }
      text = texts.pop()
      id = ids.pop()
    }
  }
  private generateTranslationTexts() {
    this.ids = []
    this.textBuffer = []

    if (this.currentSpecification && this.currentSpecification.i18n) {
      const lang = this.currentSpecification.i18n.find((l) => l.lang == this.originalLanguage)
      const translatedLang = this.currentSpecification.i18n.find((l) => l.lang == this.translationLanguage)

      if (lang && lang.texts) {
        lang.texts.forEach((t) => {
          if (translatedLang == null || null == translatedLang.texts.find((text) => text.textId == t.textId)) {
            this.textBuffer.push(t.text)
            this.ids.push(t.textId)
          }
        })
      }
    }
  }
  googleTranslate() {
    this.generateTranslationTexts()
    if (this.ids.length)
      if (this.supportsGoogleTranslate) {
        this.entityApiService
          .postTranslate(this.originalLanguage, this.translationLanguage, this.textBuffer, this.errorHandler.bind(this))
          .subscribe(this.copyTranslations2Form)
      } else {
        if (this.textBuffer.length) {
          const url = `https://translate.google.com/?sl=${this.originalLanguage}&hl=${this.translationLanguage}&text=${this.textBuffer.join('%0A')}`
          this.googleTranslateWindow = window.open(url, 'modbus2mqttTranslation')
        }
      }
  }
  getOptionKeys(entityKey: string): string[] {
    const entityId: number = parseInt(entityKey.substring(1))
    const rc: string[] = []
    if (this.currentSpecification) {
      const ent = this.currentSpecification.entities.find((ent) => ent.id == entityId)
      if (ent && getParameterType(ent.converter) == 'Iselect') {
        const opt = (ent.converterParameters as Iselect).options
        const optm = (ent.converterParameters as Iselect).optionModbusValues
        if (opt && opt.length) opt.forEach((opt) => rc.push('e' + ent!.id + 'o.' + opt.key))
        if (optm && optm.length)
          optm.forEach((opt) => {
            const oname = 'e' + ent!.id + 'o.' + opt
            if (!rc.includes(oname)) rc.push(oname)
          })
      }
    }
    return rc
  }
}
