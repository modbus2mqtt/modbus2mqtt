import { describe, it, expect, vi } from 'vitest'

;(globalThis as any).$localize = (parts: TemplateStringsArray, ...args: any[]) =>
  parts.reduce((acc, p, i) => acc + p + (i < args.length ? args[i] : ''), '')

vi.mock('ng-gallery', async () => {
  const { Component } = await import('@angular/core')
  @Component({ selector: 'gallery', standalone: true, template: '' })
  class GalleryStub {}
  return {
    GalleryComponent: GalleryStub,
    GalleryItem: class {},
    ImageItem: class {
      data: any
      constructor(d: any) {
        this.data = d
      }
    },
  }
})

import { ComponentFixture, TestBed } from '@angular/core/testing'
import { UploadFilesComponent } from './upload-files.component'
import { FileLocation, SpecificationFileUsage } from '@shared/specification'
import { ensureAngularTesting } from '../../../test-setup'

ensureAngularTesting()

function makeSpec(): any {
  return {
    filename: 'waterlevelsensor',
    entities: [],
    i18n: [],
    files: [
      {
        url: 'specifications/files/waterlevelsensor/waterleveltransmitter.pdf',
        fileLocation: FileLocation.Local,
        usage: SpecificationFileUsage.documentation,
        data: 'JVBERi0xLjQNCg==',
        mimeType: 'application/pdf',
      },
      {
        url: 'specifications/files/waterlevelsensor/waterlevel.jpg',
        fileLocation: FileLocation.Local,
        usage: SpecificationFileUsage.img,
        data: '/9j/4AAQSkZJRg==',
        mimeType: 'image/jpeg',
      },
    ],
  }
}

describe('UploadFilesComponent documents (vitest)', () => {
  async function mount(): Promise<ComponentFixture<UploadFilesComponent>> {
    await TestBed.configureTestingModule({
      imports: [UploadFilesComponent],
    }).compileComponents()
    return TestBed.createComponent(UploadFilesComponent)
  }

  it('renders the document link with a navigable (blob:) href, not a blocked data: URL', async () => {
    const fixture = await mount()
    fixture.componentInstance.currentSpecification = makeSpec()
    fixture.componentInstance.ngOnChanges() // simulate @Input change
    fixture.detectChanges()

    expect(fixture.componentInstance.documentUrls.length).toBe(1)
    // Browsers block top-level navigation to data: URLs, so opening a PDF in a new tab does
    // nothing. The href must be a navigable blob: object URL.
    const docHref = fixture.componentInstance.getFileDisplayUrl(fixture.componentInstance.documentUrls[0])
    expect(docHref.startsWith('data:')).toBe(false)
    expect(docHref.startsWith('blob:')).toBe(true)
  })

  it('switch spec A(1 doc) -> B(1 doc): document list updates (no stale doc)', async () => {
    const fixture = await mount()
    const specA = makeSpec()
    specA.files[0].url = 'specifications/files/A/aaa.pdf'
    specA.files[0].data = 'QQ=='
    fixture.componentInstance.currentSpecification = specA
    fixture.componentInstance.ngOnChanges()
    expect(fixture.componentInstance.documentUrls[0]?.url).toBe('specifications/files/A/aaa.pdf')

    // Switch to waterlevelsensor (also exactly 1 document). A length-only comparison kept
    // spec A's document here, so the new spec's document was never shown.
    fixture.componentInstance.currentSpecification = makeSpec()
    fixture.componentInstance.ngOnChanges()
    expect(fixture.componentInstance.documentUrls[0]?.url).toContain('waterleveltransmitter.pdf')
  })
})
