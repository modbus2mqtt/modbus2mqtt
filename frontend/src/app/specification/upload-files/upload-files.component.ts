import { OnChanges, Component, Input, ViewChild, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core'
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { GalleryItem, ImageItem, GalleryComponent } from 'ng-gallery'
import { IimageAndDocumentUrl, SpecificationFileUsage, ImodbusSpecification, FileLocation } from '@shared/specification'
import { MatIconButton } from '@angular/material/button'
import { MatInput } from '@angular/material/input'
import { MatFormField, MatLabel } from '@angular/material/form-field'
import { MatIcon } from '@angular/material/icon'
import { MatTooltip } from '@angular/material/tooltip'
import { DragndropDirective } from '../dragndrop/dragndrop.directive'
import { NgClass } from '@angular/common'
import {
  MatAccordion,
  MatExpansionPanel,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
  MatExpansionPanelDescription,
} from '@angular/material/expansion'

@Component({
  selector: 'app-upload-files',
  templateUrl: './upload-files.component.html',
  styleUrl: './upload-files.component.css',
  standalone: true,
  imports: [
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    NgClass,
    MatExpansionPanelDescription,
    DragndropDirective,
    MatIconButton,
    MatTooltip,
    MatIcon,
    MatFormField,
    MatLabel,
    MatInput,
    FormsModule,
    ReactiveFormsModule,
    GalleryComponent,
  ],
})
export class UploadFilesComponent implements OnInit, OnChanges, OnDestroy {
  constructor(private fb: FormBuilder) {
    this.uploadFilesForm = this.fb.group({
      urlDocument: [null as string | null],
      urlImage: [null as string | null],
    })
    this.urlDocumentControl = this.uploadFilesForm.get('urlDocument') as FormControl
    this.urlImageControl = this.uploadFilesForm.get('urlImage') as FormControl
  }
  @Input('specification') currentSpecification: ImodbusSpecification | null = null
  uploadFilesForm: FormGroup
  urlDocumentControl: FormControl<string | null>
  urlImageControl: FormControl<string | null>
  @Output()
  updateDocumentation = new EventEmitter<IimageAndDocumentUrl[]>()

  @ViewChild('addImageUrlButton')
  addImageUrlButton: MatIconButton | undefined = undefined
  @ViewChild('addDocumentUrlButton')
  addDocumentUrlButton: MatIconButton | undefined = undefined
  galleryItems: GalleryItem[] = []
  imageUrls: IimageAndDocumentUrl[] = []
  documentUrls: IimageAndDocumentUrl[] = []
  ngOnChanges(): void {
    this.generateDocumentUrls()
    this.generateImageGalleryItems()
    if (this.addImageUrlButton) this.addImageUrlButton.disabled = true
    if (this.addDocumentUrlButton) this.addDocumentUrlButton.disabled = true
  }
  ngOnInit(): void {
    this.generateDocumentUrls()
  }
  private fileBrowseHandler(input: EventTarget | null, usage: SpecificationFileUsage) {
    if (input && (input as HTMLInputElement).files !== null)
      if (usage == SpecificationFileUsage.documentation) this.onDocumentationDropped((input as HTMLInputElement).files!)
      else this.onImageDropped((input as HTMLInputElement).files!)
  }
  imageBrowseHandler(input: EventTarget | null) {
    this.fileBrowseHandler(input, SpecificationFileUsage.img)
  }
  documenationBrowseHandler(input: EventTarget | null) {
    this.fileBrowseHandler(input, SpecificationFileUsage.documentation)
  }

  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg'
      case 'png':
        return 'image/png'
      case 'gif':
        return 'image/gif'
      case 'svg':
        return 'image/svg+xml'
      case 'webp':
        return 'image/webp'
      case 'pdf':
        return 'application/pdf'
      default:
        return 'application/octet-stream'
    }
  }

  getBaseFilename(filename: string): string {
    const idx = filename.lastIndexOf('/')
    if (idx >= 0) return filename.substring(idx + 1)
    return filename
  }

  onFileDropped(files: FileList, usage: SpecificationFileUsage) {
    if (!this.currentSpecification) return
    const specFiles = this.currentSpecification.files
    let pending = 0

    Array.prototype.forEach.call(files, (file: File) => {
      const found = specFiles.find(
        (u) => this.getBaseFilename(u.url).toLowerCase() === file.name.toLowerCase() && u.usage === usage
      )
      if (found) return

      pending++
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        // dataUrl is "data:<mimeType>;base64,<data>" - extract the base64 part
        const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1)
        const entry: IimageAndDocumentUrl = {
          url: file.name,
          fileLocation: FileLocation.Local,
          usage: usage,
          data: base64,
          mimeType: this.getMimeType(file.name),
        }
        specFiles.push(entry)
        pending--
        if (pending === 0) {
          if (usage === SpecificationFileUsage.img) this.generateImageGalleryItems()
          else this.generateDocumentUrls()
          this.updateDocumentation.next(specFiles)
        }
      }
      reader.readAsDataURL(file)
    })
  }
  onImageDropped(event: FileList) {
    this.onFileDropped(event, SpecificationFileUsage.img)
  }
  onDocumentationDropped(event: FileList) {
    this.onFileDropped(event, SpecificationFileUsage.documentation)
  }

  private addDocument(control: FormControl, usage: SpecificationFileUsage) {
    const url = control.value
    if (url && this.currentSpecification) {
      const found = this.currentSpecification.files.find((f) => f.url === url)
      if (!found) {
        const entry: IimageAndDocumentUrl = {
          url: url,
          fileLocation: FileLocation.Global,
          usage: usage,
        }
        this.currentSpecification.files.push(entry)
        if (usage === SpecificationFileUsage.img) this.generateImageGalleryItems()
        else this.generateDocumentUrls()
        this.updateDocumentation.next(this.currentSpecification.files)
      }
    }
  }
  addDocumentUrl() {
    this.urlDocumentControl.updateValueAndValidity()
    this.addDocument(this.urlDocumentControl, SpecificationFileUsage.documentation)
  }
  addImageUrl() {
    this.urlImageControl.updateValueAndValidity()
    this.addDocument(this.urlImageControl, SpecificationFileUsage.img)
  }
  enableAddButton(event: Event, btn: MatIconButton) {
    btn.disabled = !event.target || (event.target as any).value == null || (event.target as any).value == ''
  }

  // Object URLs created from embedded base64 data, cached per file. They are created in the
  // generate* methods (not in the template-bound getter), so the getter returns a stable value
  // during change detection. Revoked on destroy.
  private blobUrlCache = new Map<IimageAndDocumentUrl, string>()

  // Pure read used by the template: never creates a URL during change detection.
  getFileDisplayUrl(file: IimageAndDocumentUrl): string {
    return this.blobUrlCache.get(file) ?? file.url
  }

  // A data: URL cannot be used as an <a href> target: browsers block top-level navigation to
  // data: URLs, so opening a document (e.g. a PDF) in a new tab does nothing. A blob: object URL
  // is navigable and works for both <a href> and <img src>. Created once per file and cached.
  private ensureBlobUrl(file: IimageAndDocumentUrl): void {
    if (file.fileLocation === FileLocation.Local && file.data && !this.blobUrlCache.has(file)) {
      const blob = this.base64ToBlob(file.data, file.mimeType || 'application/octet-stream')
      this.blobUrlCache.set(file, URL.createObjectURL(blob))
    }
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mimeType })
  }

  ngOnDestroy(): void {
    for (const url of this.blobUrlCache.values()) URL.revokeObjectURL(url)
    this.blobUrlCache.clear()
  }

  generateDocumentUrls() {
    const rc: IimageAndDocumentUrl[] = []
    if (this.currentSpecification && this.currentSpecification.files)
      for (let i = 0; i < this.currentSpecification.files.length; i++) {
        const doc = this.currentSpecification.files[i]
        if (doc.usage == SpecificationFileUsage.documentation) {
          this.ensureBlobUrl(doc)
          rc.push(doc)
        }
      }
    // Always reassign (like generateImageGalleryItems). Comparing only by length kept a
    // stale document when switching between two specs that each have the same number of
    // documents, so the new spec's document was never shown.
    this.documentUrls = rc
  }
  generateImageGalleryItems(): void {
    const rc: GalleryItem[] = []
    const rd: IimageAndDocumentUrl[] = []
    this.currentSpecification?.files.forEach((img) => {
      if (img.usage == SpecificationFileUsage.img) {
        this.ensureBlobUrl(img)
        const displayUrl = this.getFileDisplayUrl(img)
        rc.push(new ImageItem({ src: displayUrl, thumb: displayUrl }))
        rd.push(img)
      }
    })
    this.imageUrls = rd
    this.galleryItems = rc
  }
  deleteFile(uploadedFile: IimageAndDocumentUrl) {
    if (!this.currentSpecification) return
    const idx = this.currentSpecification.files.indexOf(uploadedFile)
    if (idx >= 0) {
      this.currentSpecification.files.splice(idx, 1)
      if (uploadedFile.usage === SpecificationFileUsage.img) this.generateImageGalleryItems()
      else this.generateDocumentUrls()
      this.updateDocumentation.next(this.currentSpecification.files)
    }
  }
}
