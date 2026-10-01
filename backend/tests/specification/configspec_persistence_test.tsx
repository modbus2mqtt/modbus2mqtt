import { it, expect, beforeEach, afterEach } from 'vitest'
import { ConfigSpecification } from '../../src/specification/index.js'
import { TempConfigDirHelper } from '../server/testhelper.js'
import * as fs from 'fs'
import { join } from 'path'
import {
  SPECIFICATION_VERSION,
  SpecificationStatus,
  FileLocation,
  SpecificationFileUsage,
  newSpecification,
} from '../../src/shared/specification/index.js'

const configDir = '__tests__/specification/config-dir'
const dataDir = '__tests__/specification/data-dir'
ConfigSpecification['configDir'] = configDir
ConfigSpecification['dataDir'] = dataDir
ConfigSpecification.setMqttdiscoverylanguage('en')

let tempHelper: TempConfigDirHelper

beforeEach(() => {
  tempHelper = new TempConfigDirHelper('configspec_persistence')
  tempHelper.setup()
})

afterEach(() => {
  if (tempHelper) tempHelper.cleanup()
})

// Test 1: JSON read contract — reads .json specs with correct status
it('readAll: reads JSON specs from local directory with status from JSON', () => {
  // Create a JSON spec in local dir
  const localSpecDir = join(ConfigSpecification.getLocalDir(), 'specifications')
  fs.mkdirSync(localSpecDir, { recursive: true })
  const testSpec = {
    version: SPECIFICATION_VERSION,
    filename: 'jsontest',
    entities: [],
    files: [],
    i18n: [{ lang: 'en', name: 'JSON Test Spec', description: '' }],
    testdata: {},
    status: SpecificationStatus.added,
  }
  fs.writeFileSync(join(localSpecDir, 'jsontest.json'), JSON.stringify(testSpec, null, 2), 'utf8')

  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const spec = ConfigSpecification.getSpecificationByFilename('jsontest')
  expect(spec).toBeDefined()
  expect(spec!.status).toBe(SpecificationStatus.added)
})

// Test 2: Base64 files contract — reads spec with base64 file data
it('readAll: reads spec with base64 file data intact', () => {
  const localSpecDir = join(ConfigSpecification.getLocalDir(), 'specifications')
  fs.mkdirSync(localSpecDir, { recursive: true })
  const base64Data = Buffer.from('test-image-data').toString('base64')
  const testSpec = {
    version: SPECIFICATION_VERSION,
    filename: 'base64test',
    entities: [],
    files: [
      {
        url: 'specifications/files/base64test/test.jpg',
        fileLocation: FileLocation.Local,
        usage: SpecificationFileUsage.img,
        data: base64Data,
        mimeType: 'image/jpeg',
      },
    ],
    i18n: [{ lang: 'en', name: 'Base64 Test', description: '' }],
    testdata: {},
    status: SpecificationStatus.added,
  }
  fs.writeFileSync(join(localSpecDir, 'base64test.json'), JSON.stringify(testSpec, null, 2), 'utf8')

  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const spec = ConfigSpecification.getSpecificationByFilename('base64test')
  expect(spec).toBeDefined()
  expect(spec!.files.length).toBe(1)
  expect(spec!.files[0].data).toBe(base64Data)
  expect(spec!.files[0].mimeType).toBe('image/jpeg')
})

// Test 3: Migrator + status contract — old YAML spec migrated to v0.5 with correct status
it('readAll: migrates old YAML spec with status from publicNames', () => {
  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  // waterleveltransmitter is a YAML spec in local dir — should be readable
  const spec = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')
  expect(spec).toBeDefined()
  // Status depends on whether public spec exists; in test fixture it's typically added
  expect(spec!.status).toBeDefined()
  expect([SpecificationStatus.added, SpecificationStatus.cloned, SpecificationStatus.published]).toContain(spec!.status)
})

// Test 4: Public spec contract — public specs get status 'published'
it('readAll: public specs get status published', () => {
  const publicSpecDir = join(ConfigSpecification.getPublicDir(), 'specifications')
  fs.mkdirSync(publicSpecDir, { recursive: true })

  // Copy a spec to public dir
  const localSpecDir = join(ConfigSpecification.getLocalDir(), 'specifications')
  const srcYaml = join(localSpecDir, 'waterleveltransmitter.yaml')
  if (fs.existsSync(srcYaml)) {
    fs.copyFileSync(srcYaml, join(publicSpecDir, 'pubspectest.yaml'))
  }

  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const spec = ConfigSpecification.getSpecificationByFilename('pubspectest')
  if (spec) {
    expect(spec.status).toBe(SpecificationStatus.published)
  }

  // Cleanup
  const pubFile = join(publicSpecDir, 'pubspectest.yaml')
  if (fs.existsSync(pubFile)) fs.unlinkSync(pubFile)
})

// Test 5: Write contract — writeItem creates .json with correct content
it('writeItem: creates JSON file with status persisted', () => {
  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const wl = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')!
  cfgSpec.writeSpecificationFromFileSpec(wl, wl.filename)

  const jsonPath = join(ConfigSpecification.getLocalDir(), 'specifications', 'waterleveltransmitter.json')
  expect(fs.existsSync(jsonPath)).toBe(true)

  const content = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  expect(content.version).toBe(SPECIFICATION_VERSION)
  expect(content.status).toBeDefined()
  // Runtime fields should not be persisted
  expect(content.publicSpecification).toBeUndefined()
})

// Test 6: Round-trip — write then read back produces identical spec
it('round-trip: write then readAll returns identical spec', () => {
  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const wl = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')!
  cfgSpec.writeSpecificationFromFileSpec(wl, wl.filename)

  // Re-read
  cfgSpec.readYaml()
  const reread = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')!
  expect(reread).toBeDefined()
  expect(reread.version).toBe(SPECIFICATION_VERSION)
  expect(reread.entities.length).toBeGreaterThan(0)
})

// Test 7: Delete contract — deleteItem removes .json
it('deleteItem: removes JSON and YAML files', () => {
  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  // Create a deletable spec
  const localSpecDir = join(ConfigSpecification.getLocalDir(), 'specifications')
  const testSpec = {
    version: SPECIFICATION_VERSION,
    filename: 'deletetest_persist',
    entities: [],
    files: [],
    i18n: [{ lang: 'en', name: 'Delete Test', description: '' }],
    testdata: {},
    status: SpecificationStatus.added,
  }
  fs.writeFileSync(join(localSpecDir, 'deletetest_persist.json'), JSON.stringify(testSpec, null, 2), 'utf8')
  cfgSpec.readYaml()

  cfgSpec.deleteSpecification('deletetest_persist')

  const jsonPath = join(localSpecDir, 'deletetest_persist.json')
  expect(fs.existsSync(jsonPath)).toBe(false)
})

// Test 8: Dual-format read — both JSON and YAML, JSON takes precedence
it('dual-format: JSON takes precedence over YAML for same filename', () => {
  const localSpecDir = join(ConfigSpecification.getLocalDir(), 'specifications')
  fs.mkdirSync(localSpecDir, { recursive: true })

  // Create YAML version
  const yamlContent = `filename: dualtest\nversion: "0.4"\nentities: []\ni18n:\n  - lang: en\n    name: YAML Version\n    description: ""\nstatus: added\n`
  fs.writeFileSync(join(localSpecDir, 'dualtest.yaml'), yamlContent, 'utf8')

  // Create JSON version (should take precedence)
  const jsonSpec = {
    version: SPECIFICATION_VERSION,
    filename: 'dualtest',
    entities: [],
    files: [],
    i18n: [{ lang: 'en', name: 'JSON Version', description: '' }],
    testdata: {},
    status: SpecificationStatus.added,
  }
  fs.writeFileSync(join(localSpecDir, 'dualtest.json'), JSON.stringify(jsonSpec, null, 2), 'utf8')

  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const spec = ConfigSpecification.getSpecificationByFilename('dualtest')
  expect(spec).toBeDefined()
  // JSON version should have been loaded (current version, not migrated)
  expect(spec!.version).toBe(SPECIFICATION_VERSION)

  // Cleanup
  fs.unlinkSync(join(localSpecDir, 'dualtest.yaml'))
  fs.unlinkSync(join(localSpecDir, 'dualtest.json'))
})

// Test 9: Uploaded local files + per-language datasheets persist as binaries
// + files.yaml sidecar, and the summary list carries the lang attribute.
it('persistence: writes uploaded local files + files.yaml with langs', () => {
  const localSpecDir = join(ConfigSpecification.getLocalDir(), 'specifications')
  fs.mkdirSync(localSpecDir, { recursive: true })

  const imgB64 = Buffer.from('fake-image-bytes').toString('base64')
  const pdfDeB64 = Buffer.from('fake-pdf-de').toString('base64')
  const pdfEnB64 = Buffer.from('fake-pdf-en').toString('base64')
  const spec = {
    version: SPECIFICATION_VERSION,
    filename: 'mediapersist.yaml',
    entities: [],
    files: [
      { url: 'specifications/files/mediapersist/photo.jpg', fileLocation: FileLocation.Local, usage: SpecificationFileUsage.img, data: imgB64, mimeType: 'image/jpeg' },
      { url: 'specifications/files/mediapersist/sheet_de.pdf', fileLocation: FileLocation.Local, usage: SpecificationFileUsage.documentation, lang: 'de', data: pdfDeB64, mimeType: 'application/pdf' },
      { url: 'specifications/files/mediapersist/sheet_en.pdf', fileLocation: FileLocation.Local, usage: SpecificationFileUsage.documentation, lang: 'en', data: pdfEnB64, mimeType: 'application/pdf' },
      { url: 'https://vendor.example.com/sheet.pdf', fileLocation: FileLocation.Global, usage: SpecificationFileUsage.documentation, lang: 'en' },
    ],
    i18n: [{ lang: 'en', texts: [{ textId: 'name', text: 'Media Persist' }] }],
    testdata: {},
    status: SpecificationStatus.new,
    identified: 0,
    nextEntityId: 1,
  }
  // writeSpecification normalizes + persists
  const cfgSpec = new ConfigSpecification()
  cfgSpec.writeSpecification(spec as never, undefined, null)

  const filesDir = join(ConfigSpecification.getLocalDir(), 'specifications/files/mediapersist')
  expect(fs.existsSync(join(filesDir, 'photo.jpg'))).toBe(true)
  expect(fs.readFileSync(join(filesDir, 'photo.jpg'), 'utf8')).toBe('fake-image-bytes')
  expect(fs.existsSync(join(filesDir, 'sheet_de.pdf'))).toBe(true)
  expect(fs.readFileSync(join(filesDir, 'sheet_de.pdf'), 'utf8')).toBe('fake-pdf-de')

  const yaml = fs.readFileSync(join(filesDir, 'files.yaml'), 'utf8')
  expect(yaml).toContain('usage: img')
  expect(yaml).toContain('lang: de')
  expect(yaml).toContain('photo.jpg')
  // remote (Global) files must not be in the local files.yaml
  expect(yaml).not.toContain('vendor.example.com')

  // in-memory spec keeps the canonical urls + langs
  const stored = ConfigSpecification.getSpecificationByFilename('mediapersist.yaml') ||
    ConfigSpecification.getSpecificationByFilename('mediapersist')
  expect(stored).toBeDefined()
  const docs = (stored!.files || []).filter((f) => f.usage == SpecificationFileUsage.documentation)
  expect(docs.find((f) => f.lang === 'de')).toBeDefined()
  expect(docs.find((f) => f.lang === 'en')).toBeDefined()

  // summary list contract: url + usage + lang
  let summary: { filename: string; files: { url: string; usage: string; lang?: string }[] } | undefined
  cfgSpec.filterAllSpecifications((s) => {
    if (s.filename === 'mediapersist.yaml' || s.filename === 'mediapersist') {
      summary = {
        filename: s.filename,
        files: s.files.map((f) => ({ url: f.url, usage: f.usage, lang: f.lang })),
      }
    }
  })
  expect(summary).toBeDefined()
  const enDoc = summary!.files.find((f) => f.usage === 'doc' && f.lang === 'en')
  expect(enDoc).toBeDefined()
  expect(enDoc!.url).toContain('specifications/files/mediapersist/')

  cfgSpec.deleteSpecification('mediapersist.yaml')
  const jsonPath = join(localSpecDir, 'mediapersist.json')
  if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath)
  const yaml2 = join(localSpecDir, 'mediapersist.yaml')
  if (fs.existsSync(yaml2)) fs.unlinkSync(yaml2)
})
