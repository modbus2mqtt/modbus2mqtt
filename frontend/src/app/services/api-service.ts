import { Injectable } from '@angular/core'
import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Observable, Subject, of } from 'rxjs'
import { catchError, first, map } from 'rxjs/operators'
//we've defined our base url here in the env
import {
  ImodbusSpecification,
  ImodbusEntity,
  HttpErrorsEnum,
  Ispecification,
  IspecificationSummary,
  editableConverters,
  Imessage,
  IimportMessages,
  Converters,
} from '@shared/specification'
import { ActivatedRoute, Router } from '@angular/router'
import { I18nService } from './i18n.service'
import { ImodbusEntityWithName } from './specificationInterface'
import {
  apiUri,
  Iconfiguration,
  IUserAuthenticationStatus,
  IBus,
  Islave,
  IidentificationSpecification,
  IModbusConnection,
} from '@shared/server'

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  converterCache: Converters[] | undefined = undefined
  private rootUrl = '.'
  constructor(
    private httpClient: HttpClient,
    private router: Router,
    private activeatedRoute: ActivatedRoute
  ) {
    this.errorHandler = (err: HttpErrorResponse) => {
      // 401 is handled by AuthHeaderInterceptor (redirects to OIDC login if enabled).
      // Keep other errors visible to the user.
      if ([HttpErrorsEnum.ErrUnauthorized, HttpErrorsEnum.ErrForbidden].includes(err.status)) return
      let msg = ''
      if (err.error)
        if (err.error.error) msg += err.error.error + '\n'
        else msg += err.error + '\n'
      msg += err.statusText
      if (!err.error && !err.statusText && err.message) msg = err.message
      alert(msg)
    }
    if ((window as any).configuration && (window as any).configuration.rootUrl) this.rootUrl = (window as any).configuration.rootUrl
  }
  private getFullUri(uri: apiUri): string {
    return this.rootUrl + uri
  }

  loadingError$ = new Subject<boolean>()

  errorHandler: (err: HttpErrorResponse) => any
  // filedata=true requests the full specification including base64 file contents
  // (files[].data) — needed only by the specification editor whose save posts the
  // complete specification back (transactional save). Everything else gets the
  // lightweight form with file references only.
  getSpecification(specification: string | undefined = undefined, filedata: boolean = false): Observable<Ispecification> {
    if (!specification) throw new Error('spec is a required parameter')

    const f: string = this.getFullUri(apiUri.specfication) + `?spec=${specification}` + (filedata ? '&filedata=true' : '')
    return this.httpClient.get<Ispecification>(f) // No error Handling!!!
  }

  getModbusSpecification(
    busid: number,
    slaveid: number,
    specification: string | undefined = undefined,
    deviceDetection: boolean | undefined = undefined,
    filedata: boolean = false
  ): Observable<ImodbusSpecification> {
    let deviceDetectionStr: string = ''
    if (deviceDetection) deviceDetectionStr = '&deviceDetection=1'

    let f: string = this.getFullUri(apiUri.modbusSpecification) + `?busid=${busid}&slaveid=${slaveid}`
    if (specification) f = f + `&spec=${specification}${deviceDetectionStr}`
    if (filedata) f = f + '&filedata=true'
    return this.httpClient.get<ImodbusSpecification>(f).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<ImodbusSpecification>()
      })
    )
  }
  getConverters(): Observable<Converters[]> {
    if (this.converterCache != undefined) {
      const sub = new Subject<Converters[]>()
      sub.pipe(first())
      setTimeout(() => {
        sub.next(this.converterCache!)
      }, 1)
      return sub
    }

    const url = this.getFullUri(apiUri.converters)
    return this.httpClient.get<Converters[]>(url).pipe(
      map((cnv) => {
        this.converterCache = cnv as Converters[]
        return cnv
      }),
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<Converters[]>()
      })
    )
  }
  postValidateMqtt(config: Iconfiguration): Observable<{ valid: boolean; message: string }> {
    const url = this.getFullUri(apiUri.validateMqtt)
    return this.httpClient.post<{ valid: boolean; message: string }>(url, config).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<{ valid: boolean; message: string }>()
      })
    )
  }
  getSslFiles(): Observable<string[]> {
    const url = this.getFullUri(apiUri.sslFiles)
    return this.httpClient.get<string[]>(url).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<string[]>()
      })
    )
  }
  getSerialDevices(): Observable<string[]> {
    const url = this.getFullUri(apiUri.serialDevices)
    return this.httpClient.get<string[]>(url).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<string[]>()
      })
    )
  }
  getUserAuthenticationStatus(): Observable<IUserAuthenticationStatus> {
    const url = this.getFullUri(apiUri.userAuthenticationStatus)
    return this.httpClient.get<IUserAuthenticationStatus>(url).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<IUserAuthenticationStatus>()
      })
    )
  }
  getBusses(): Observable<IBus[]> {
    const url = this.getFullUri(apiUri.busses)
    return this.httpClient.get<IBus[]>(url).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<IBus[]>()
      })
    )
  }
  getBus(busid: number): Observable<IBus> {
    const url = this.getFullUri(apiUri.bus) + `?busid=${busid}`
    return this.httpClient.get<IBus>(url).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<IBus>()
      })
    )
  }
  getSlave(busid: number, slaveid: number): Observable<Islave> {
    return this.httpClient.get<Islave>(this.getFullUri(apiUri.slave) + `?busid=${busid}&slaveid=${slaveid}`).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<Islave>()
      })
    )
  }
  getSlaves(busid: number): Observable<Islave[]> {
    return this.httpClient.get<Islave[]>(this.getFullUri(apiUri.slaves) + `?busid=${busid}`).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<Islave[]>()
      })
    )
  }
  getSpecsDetection(
    busid: number,
    specificSlaveId: number,
    showAllPublicSpecs: boolean,
    language: string
  ): Observable<IidentificationSpecification[]> {
    const p1 = specificSlaveId ? '&slaveid=' + specificSlaveId : ''
    let param = '?busid=' + busid + p1 + '&language=' + language
    if (showAllPublicSpecs) param = param + '&showAllPublicSpecs=true'
    return this.httpClient.get<IidentificationSpecification[]>(this.getFullUri(apiUri.specsDetection) + `${param}`).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<IidentificationSpecification[]>()
      })
    )
  }
  getSpecifications(): Observable<IspecificationSummary[]> {
    return this.httpClient.get<IspecificationSummary[]>(this.getFullUri(apiUri.specifications)).pipe(
      catchError((err): Observable<IspecificationSummary[]> => {
        this.loadingError$.next(true)
        this.errorHandler(err)
        return new Observable<IspecificationSummary[]>()
      })
    )
  }

  postBus(connection: IModbusConnection, busid?: number): Observable<{ busid: number }> {
    let url = this.getFullUri(apiUri.bus)
    if (busid != undefined) url = `${url}?busid=${busid}`
    return this.httpClient.post<{ busid: number }>(url, connection).pipe(
      catchError((err): Observable<{ busid: number }> => {
        this.errorHandler(err)
        return new Observable<{ busid: number }>()
      })
    )
  }
  postTranslate(
    originalLanguage: string,
    translationLanguage: string,
    text: string[],
    errorHandler?: (err: HttpErrorResponse) => boolean
  ): Observable<string[]> {
    const httpOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
    }
    const request = {
      contents: text,
      mimeType: 'text/plain',
      sourceLanguageCode: originalLanguage,
      targetLanguageCode: translationLanguage,
    }

    return this.httpClient.post<string[]>(this.getFullUri(apiUri.translate), request, httpOptions).pipe(
      catchError((err): Observable<string[]> => {
        if (errorHandler == undefined || !errorHandler(err)) this.errorHandler(err)
        return new Observable<string[]>()
      })
    )
  }

  postSpecification(
    specification: ImodbusSpecification,
    busid: number,
    slaveid: number,
    originalFilename: string | null = null
  ): Observable<ImodbusSpecification> {
    const httpOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
    }
    return this.httpClient
      .post<ImodbusSpecification>(
        this.getFullUri(apiUri.specfication) + `?busid=${busid}&slaveid=${slaveid}&originalFilename=${originalFilename}`,
        specification,
        httpOptions
      )
      .pipe(
        catchError((err): Observable<ImodbusSpecification> => {
          this.errorHandler(err)
          return new Observable<ImodbusSpecification>()
        })
      )
  }

  postSlave(busid: number, device: Islave): Observable<Islave> {
    const httpOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
    }
    const f = this.getFullUri(apiUri.slave) + `?busid=${busid}`
    // The specification is a client-side decoration (fetched separately); the backend
    // persists slaves without it — don't upload it with every save.
    const body = { ...device }
    delete body.specification
    return this.httpClient.post<Islave>(f, body, httpOptions).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<Islave>()
      })
    )
  }
  getConfiguration(): Observable<Iconfiguration> {
    return this.httpClient.get<Iconfiguration>(this.getFullUri(apiUri.configuration)).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<Iconfiguration>()
      })
    )
  }
  postConfiguration(config: Iconfiguration): Observable<Iconfiguration> {
    return this.httpClient.post<Iconfiguration>(this.getFullUri(apiUri.configuration), config).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<Iconfiguration>()
      })
    )
  }
  postModbusEntity(
    spec: ImodbusSpecification,
    changedEntity: ImodbusEntity,
    busid: number,
    slaveid: number,
    _language: string
  ): Observable<ImodbusEntityWithName> {
    return this.httpClient
      .post<ImodbusEntity>(
        this.getFullUri(apiUri.modbusEntity) + `?busid=${busid}&slaveid=${slaveid}&entityid=${changedEntity.id}`,
        spec
      )
      .pipe(
        catchError((err) => {
          this.errorHandler(err)
          return new Observable<ImodbusEntityWithName>()
        })
      )
  }
  postModbusWriteMqtt(
    spec: ImodbusSpecification,
    entityid: number,
    busid: number,
    slaveid: number,
    language: string,
    mqttValue: string
  ): Observable<string> {
    const lSpec: ImodbusSpecification = structuredClone(spec)
    const entity = lSpec.entities.find((e) => e.id == entityid)
    if (entity && editableConverters.includes(entity.converter)) {
      switch (entity.converter) {
        case 'select':
          I18nService.specificationTextsToTranslation(lSpec, language, entity)
          return this.httpClient
            .post<string>(
              this.getFullUri(apiUri.writeEntity) +
                `?busid=${busid}&slaveid=${slaveid}&entityid=${entityid}&mqttValue=${mqttValue}&language=${language}`,
              lSpec
            )
            .pipe(
              catchError((err) => {
                this.errorHandler(err)
                return new Observable<string>()
              })
            )
        default:
          return this.httpClient
            .post<string>(
              this.getFullUri(apiUri.writeEntity) +
                `?busid=${busid}&slaveid=${slaveid}&entityid=${entityid}&mqttValue=${mqttValue}&language=${language}`,
              lSpec
            )
            .pipe(
              catchError((err) => {
                this.errorHandler(err)
                return new Observable<string>()
              })
            )
      }
    } else throw new Error('entityid ' + entityid + ' not found ')
  }
  importSpecification(spec: object): Observable<IimportMessages> {
    return this.httpClient.post<IimportMessages>(this.getFullUri(apiUri.uploadSpec), spec).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<IimportMessages>()
      })
    )
  }
  postSpecificationContribution(spec: string, note: string): Observable<number> {
    return this.httpClient.post<number>(this.getFullUri(apiUri.specficationContribute) + `?spec=${spec}`, {
      note: note,
    })
  }
  getForSpecificationValidation(specfilename: string, language: string): Observable<Imessage[]> {
    return this.httpClient
      .get<Imessage[]>(this.getFullUri(apiUri.specificationValidate) + `?language=${language}&spec=${specfilename}`)
      .pipe(
        catchError((err) => {
          this.errorHandler(err)
          return of([])
        })
      )
  }
  getSpecificationFetchPublic(): Observable<void> {
    return this.httpClient.get<void>(this.getFullUri(apiUri.specificationFetchPublic)).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<void>()
      })
    )
  }

  postForSpecificationValidation(spec: ImodbusSpecification, language: string): Observable<Imessage[]> {
    return this.httpClient.post<Imessage[]>(this.getFullUri(apiUri.specificationValidate) + `?language=${language}`, spec).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<Imessage[]>()
      })
    )
  }
  deleteBus(busid: number): Observable<void> {
    return this.httpClient.delete<void>(this.getFullUri(apiUri.bus) + `?busid=${busid}`).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<void>()
      })
    )
  }
  /**
   * detachReferences lets the backend turn the slaves referencing this one into standalone slaves
   * (keeping their inherited configuration) instead of refusing the delete with a 409.
   * errorHandler returning true suppresses the global alert, so the caller can handle the 409 itself.
   */
  deleteSlave(
    busid: number,
    slaveid: number,
    detachReferences: boolean = false,
    errorHandler?: (err: HttpErrorResponse) => boolean
  ): Observable<void> {
    const detach = detachReferences ? '&detachReferences=true' : ''
    return this.httpClient.delete<void>(this.getFullUri(apiUri.slave) + `?busid=${busid}&slaveid=${slaveid}` + detach).pipe(
      catchError((err) => {
        if (errorHandler == undefined || !errorHandler(err)) this.errorHandler(err)
        return new Observable<void>()
      })
    )
  }
  deleteSpecification(specFilename: string): Observable<void> {
    return this.httpClient.delete<void>(this.getFullUri(apiUri.specfication) + `?spec=${specFilename}`).pipe(
      catchError((err) => {
        this.errorHandler(err)
        return new Observable<void>()
      })
    )
  }
}
