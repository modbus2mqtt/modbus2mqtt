import { ChangeDetectorRef, Component, OnInit } from '@angular/core'
import { ApiService } from '../services/api-service'
import { FormBuilder } from '@angular/forms'
import { Router } from '@angular/router'
import { Observable, Subject, catchError, first, forkJoin, map } from 'rxjs'
import {
  Imessage,
  IspecificationSummary,
  SpecificationFileUsage,
  SpecificationStatus,
  getSpecificationI18nName,
} from '@shared/specification/index'
import { SpecificationServices } from '../services/specificationServices'
import { Iconfiguration, IUserAuthenticationStatus } from '@shared/server'
import { GalleryItem, ImageItem } from 'ng-gallery'
import { MatIcon } from '@angular/material/icon'
import { MatTooltip } from '@angular/material/tooltip'
import { NgClass } from '@angular/common'
import { MatButton, MatIconButton } from '@angular/material/button'
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card'
import { InfoboxComponent } from '../infobox/infobox.component'

interface IspecificationSummaryWithMessages extends IspecificationSummary {
  messages: Imessage[]
}

@Component({
  selector: 'app-specifications',
  templateUrl: './specifications.component.html',
  styleUrl: './specifications.component.css',
  imports: [
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    MatButton,
    MatTooltip,
    MatIcon,
    MatIconButton,
    NgClass,
    InfoboxComponent,
  ],
})
export class SpecificationsComponent implements OnInit {
  config: Iconfiguration | undefined
  private specServices: SpecificationServices | undefined
  private authStatus: IUserAuthenticationStatus | undefined = undefined
  specifications: IspecificationSummaryWithMessages[] | undefined
  galleryItems: Map<string, GalleryItem[]> = new Map<string, GalleryItem[]>()
  message: Subject<string> = new Subject<string>()
  constructor(
    private apiService: ApiService,
    private fb: FormBuilder,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}
  contributing: boolean = false
  fillSpecifications(specs: IspecificationSummary[]) {
    if (!this.config) return
    const a: any = {}
    this.galleryItems = new Map<string, GalleryItem[]>()

    specs.forEach((spec) => {
      // Specifications Component doesn't change a Specification
      // for validation of identification, it's better to use the Filespecification
      // This happens in getForSpecificationValidation
      const ox = this.apiService.getForSpecificationValidation(spec.filename, this.config!.mqttdiscoverylanguage)
      a[spec.filename] = ox
      this.generateImageGalleryItems(spec)
    })
    forkJoin(a).subscribe((o: any) => {
      Object.entries(o).forEach(([key, value]) => {
        const s: any = specs.find((spec) => spec.filename == key)
        if (s) (s as IspecificationSummaryWithMessages).messages = value as any
      })
      this.specifications = specs as IspecificationSummaryWithMessages[]
      this.cdr.markForCheck()
    })
  }
  ngOnInit(): void {
    this.apiService.getConfiguration().subscribe((config) => {
      this.config = config
      this.apiService.getUserAuthenticationStatus().subscribe((authStatus) => {
        this.authStatus = authStatus
        this.specServices = new SpecificationServices(config.mqttdiscoverylanguage, this.apiService)
        this.apiService.getSpecifications().subscribe(this.fillSpecifications.bind(this))
      })
    })
  }

  importSpecification() {
    throw new Error('Method not implemented.')
  }
  exportSpecification(_spec: IspecificationSummary) {
    throw new Error('Method not implemented.')
  }
  deleteSpecification(spec: IspecificationSummary) {
    if ([SpecificationStatus.added, SpecificationStatus.new, SpecificationStatus.cloned].includes(spec.status)) {
      if (confirm('Are you sure to delete ' + this.getTranslatedSpecName(spec))) {
        this.apiService.deleteSpecification(spec.filename).subscribe(() => {
          this.apiService.getSpecifications().subscribe(this.fillSpecifications.bind(this))
          alert(this.getTranslatedSpecName(spec) + ' has been deleted')
        })
      }
    } else {
      alert(this.getTranslatedSpecName(spec) + ' is not local. Only local specifications can be deleted')
    }
  }
  getTranslatedSpecName(spec: IspecificationSummary): string | null {
    if (this.config && this.config.mqttdiscoverylanguage && spec)
      return getSpecificationI18nName(spec, this.config.mqttdiscoverylanguage)
    return null
  }
  contributeSpecification(spec: IspecificationSummary) {
    this.contributing = true
    this.apiService
      .postSpecificationContribution(spec.filename, 'My test note')
      .pipe(
        catchError((err) => {
          this.contributing = false
          this.apiService.errorHandler(err)
          return new Observable<number>()
        })
      )
      .subscribe((_issue) => {
        this.apiService.getSpecifications().subscribe(this.fillSpecifications.bind(this))
        this.message.next('Successfully contributed. Created pull Request #' + _issue)
        this.contributing = false
      })
  }

  canContribute(spec: IspecificationSummary): Observable<boolean> {
    const rc = ![SpecificationStatus.published, SpecificationStatus.contributed].includes(spec.status)
    if (!rc || !this.config) {
      const s = new Subject<boolean>()
      setTimeout(() => {
        s.next(false)
      }, 1)
      return s.pipe(first())
    }
    // Specifications Component doesn't change a Specification
    // for validation of identification, it's better to use the Filespecification
    // This happens in getForSpecificationValidation
    return this.apiService.getForSpecificationValidation(spec.filename, this.config.mqttdiscoverylanguage).pipe(
      map((messages) => {
        return messages.length == 0
      })
    )
  }

  getValidationMessage(spec: IspecificationSummary, message: Imessage): string {
    if (this.specServices) return this.specServices.getValidationMessage(spec, message)
    else return 'unknown message'
  }

  getStatusIcon(status: SpecificationStatus): string {
    return SpecificationServices.getStatusIcon(status)
  }
  getStatusText(status: SpecificationStatus): string {
    return SpecificationServices.getStatusText(status)
  }
  fetchPublic() {
    this.apiService.getSpecificationFetchPublic().subscribe(() => {
      this.ngOnInit()
      this.message.next('Public directory updated')
    })
  }
  generateImageGalleryItems(spec: IspecificationSummary): void {
    const rc: GalleryItem[] = []
    spec.files.forEach((img) => {
      if (img.usage == SpecificationFileUsage.img) {
        rc.push(new ImageItem({ src: img.url, thumb: img.url }))
      }
    })
    this.galleryItems.set(spec.filename, rc)
  }
  getImage(fn: string) {
    const d = this.galleryItems.get(fn)
    if (d && d.length > 0 && d[0].data && d[0].data.src) return d[0].data.src as string
    return ''
  }
  onJsonFileDropped(files: FileList) {
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const spec = JSON.parse(reader.result as string)
          this.apiService.importSpecification(spec).subscribe((errors) => {
            let msg = 'Specification imported: ' + (spec.filename || file.name)
            if (errors.warnings) msg = msg + '\n\n' + errors.warnings
            this.message.next(msg)
            this.apiService.getSpecifications().subscribe(this.fillSpecifications.bind(this))
          })
        } catch {
          this.message.next('Invalid JSON file: ' + file.name)
        }
      }
      reader.readAsText(file)
    })
  }
  jsonBrowseHandler(input: EventTarget | null) {
    if (input && (input as HTMLInputElement).files !== null) this.onJsonFileDropped((input as HTMLInputElement).files!)
  }
  generateDownloadLink(what: string): string {
    // Downloads go through the normal /download/<what> route — session cookie
    // (OIDC) or HA IP-whitelist covers the auth case.
    return 'download/' + what
  }
}
