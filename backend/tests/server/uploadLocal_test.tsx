import { it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { TempConfigDirHelper } from './testhelper.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { HttpErrorsEnum } from '../../src/shared/server/index.js'

setConfigsDirsForTest()

let tempHelper: TempConfigDirHelper
let persistence: ConfigPersistence

beforeAll(() => {
  tempHelper = new TempConfigDirHelper('upload_local')
  tempHelper.setup()
  persistence = new ConfigPersistence()
})

afterAll(() => {
  if (tempHelper) tempHelper.cleanup()
})

function clearLocalDir(): void {
  const dir = ConfigPersistence.getLocalDir()
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

function buildExportZip(): Buffer {
  const archive = new AdmZip()
  const dir = ConfigPersistence.getLocalDir()
  if (!fs.existsSync(dir)) return archive.toBuffer()
  const files: string[] = fs.readdirSync(dir, { recursive: true }) as string[]
  files.forEach((file) => {
    const p = join(dir, file)
    if (fs.statSync(p).isFile() && file.indexOf('secrets.yaml') < 0) {
      archive.addLocalFile(p, path.dirname(file))
    }
  })
  return archive.toBuffer()
}

beforeEach(() => {
  // Default: each test starts with an empty local dir.
  // Tests that need pre-existing state set it up explicitly.
  clearLocalDir()
})

it('refuses import when local directory is not empty', async () => {
  // Pre-populate local dir
  const localDir = ConfigPersistence.getLocalDir()
  fs.mkdirSync(localDir, { recursive: true })
  fs.writeFileSync(join(localDir, 'modbus2mqtt.yaml'), 'mqttbasetopic: existing\n')

  const archive = new AdmZip()
  archive.addFile('modbus2mqtt.yaml', Buffer.from('mqttbasetopic: incoming\n'))
  const result = await persistence.importLocalZip(archive.toBuffer())

  expect(result.ok).toBe(false)
  expect(result.status).toBe(HttpErrorsEnum.ErrConflict)
  // Existing content must not have been overwritten
  expect(fs.readFileSync(join(localDir, 'modbus2mqtt.yaml'), 'utf8')).toContain('existing')
})

it('rejects zip-slip path traversal', async () => {
  // adm-zip's addFile sanitizes ../, so we have to craft a malicious entry name
  // by mutating the entry after add. This simulates a zip created by a non-sanitizing tool.
  const archive = new AdmZip()
  archive.addFile('placeholder', Buffer.from('malicious'))
  const entries = archive.getEntries()
  entries[0].entryName = '../../etc/passwd'
  const result = await persistence.importLocalZip(archive.toBuffer())

  expect(result.ok).toBe(false)
  expect(result.status).toBe(HttpErrorsEnum.ErrBadRequest)
  expect(fs.existsSync(persistence.getImportMarkerPath())).toBe(false)
})

it('rejects empty zip', async () => {
  const archive = new AdmZip()
  const result = await persistence.importLocalZip(archive.toBuffer())

  expect(result.ok).toBe(false)
  expect(result.status).toBe(HttpErrorsEnum.ErrBadRequest)
})

it('rejects malformed zip buffer', async () => {
  const result = await persistence.importLocalZip(Buffer.from('not a zip'))

  expect(result.ok).toBe(false)
  expect(result.status).toBe(HttpErrorsEnum.ErrBadRequest)
})

it('imports a minimal zip and creates empty secrets.yaml', async () => {
  const archive = new AdmZip()
  archive.addFile('modbus2mqtt.yaml', Buffer.from('mqttbasetopic: imported\n'))
  const result = await persistence.importLocalZip(archive.toBuffer())

  expect(result.ok).toBe(true)
  expect(result.status).toBe(HttpErrorsEnum.OK)
  expect(fs.existsSync(persistence.getConfigPath())).toBe(true)
  expect(fs.readFileSync(persistence.getConfigPath(), 'utf8')).toContain('imported')
  expect(fs.existsSync(persistence.getSecretsPath())).toBe(true)
  expect(fs.readFileSync(persistence.getSecretsPath(), 'utf8')).toBe('{}\n')
  expect(fs.existsSync(persistence.getImportMarkerPath())).toBe(false)
})

it('skips secrets.yaml entries inside the zip', async () => {
  const archive = new AdmZip()
  archive.addFile('modbus2mqtt.yaml', Buffer.from('mqttbasetopic: imported\n'))
  archive.addFile('secrets.yaml', Buffer.from('mqttpassword: leaked\n'))
  const result = await persistence.importLocalZip(archive.toBuffer())

  expect(result.ok).toBe(true)
  // secrets.yaml in the zip was ignored — local secrets.yaml is empty
  expect(fs.readFileSync(persistence.getSecretsPath(), 'utf8')).toBe('{}\n')
})

it('round-trip: re-imports an export zip into an empty directory', async () => {
  // Set up some content
  const localDir = ConfigPersistence.getLocalDir()
  fs.mkdirSync(localDir, { recursive: true })
  fs.writeFileSync(join(localDir, 'modbus2mqtt.yaml'), 'mqttbasetopic: roundtrip\n')
  const busDir = join(localDir, 'busses', 'bus.0')
  fs.mkdirSync(busDir, { recursive: true })
  fs.writeFileSync(join(busDir, 'bus.yaml'), 'host: 192.168.1.10\nport: 502\ntimeout: 100\n')
  fs.writeFileSync(
    join(busDir, 's1.yaml'),
    'slaveid: 1\nspecificationid: testspec\n'
  )

  const zip = buildExportZip()

  // Wipe and re-import
  clearLocalDir()
  const result = await persistence.importLocalZip(zip)

  expect(result.ok).toBe(true)
  expect(fs.readFileSync(join(localDir, 'modbus2mqtt.yaml'), 'utf8')).toContain('roundtrip')
  expect(fs.existsSync(join(busDir, 'bus.yaml'))).toBe(true)
  expect(fs.existsSync(join(busDir, 's1.yaml'))).toBe(true)
  expect(fs.readFileSync(join(busDir, 'bus.yaml'), 'utf8')).toContain('192.168.1.10')
})

it('marker file blocks subsequent reads with a clear error', async () => {
  const localDir = ConfigPersistence.getLocalDir()
  fs.mkdirSync(localDir, { recursive: true })
  fs.writeFileSync(persistence.getImportMarkerPath(), '')

  await expect(persistence.read()).rejects.toThrow(/inconsistent state/)
})
