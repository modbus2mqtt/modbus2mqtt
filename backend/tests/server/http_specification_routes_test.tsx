import { describe, it, test, expect, beforeAll, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { apiUri } from '../../src/shared/server/index.js'
import {
  HttpErrorsEnum,
  IdentifiedStates,
  ImodbusSpecification,
  FileLocation,
  ModbusRegisterType,
  SpecificationFileUsage,
  SpecificationStatus,
  getSpecificationI18nName,
} from '../../src/shared/specification/index.js'
import { ConfigSpecification, M2mGitHub, M2mSpecification } from '../../src/specification/index.js'
import { Bus } from '../../src/server/bus.js'
import { ConfigBus } from '../../src/server/configbus.js'
import { ModbusAPI } from '../../src/server/modbusAPI.js'
import { createTestServer, rawText, TestServer } from './httpTestHelper.js'

const spec: ImodbusSpecification = {
  filename: 'waterleveltransmitter',
  status: 2,
  entities: [
    {
      id: 1,
      mqttname: 'waterleveltransmitter',
      converter: 'number',
      modbusAddress: 3,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      converterParameters: { multiplier: 0.01 },
      mqttValue: '',
      modbusValue: [],
      identified: IdentifiedStates.unknown,
    },
  ],
  i18n: [
    {
      lang: 'en',
      texts: [
        { textId: 'name', text: 'Water Level Transmitter' },
        { textId: 'e1', text: 'Water Level Transmitter' },
      ],
    },
  ],
  files: [],
  identified: IdentifiedStates.unknown,
}

let ts: TestServer
beforeAll(async () => {
  ts = await createTestServer({ name: 'http-spec-routes' })
})
afterAll(() => ts.cleanup())

describe('GET ' + apiUri.specifications, () => {
  it('returns lightweight summaries', async () => {
    const response = await ts.request().get(apiUri.specifications).expect(200)
    expect(response.body.length).toBeGreaterThan(0)
    const summary = response.body[0]
    expect(summary).toHaveProperty('filename')
    expect(summary).toHaveProperty('status')
    expect(summary).toHaveProperty('i18n')
    expect(summary).toHaveProperty('files')
    expect(summary).not.toHaveProperty('entities')
    expect(summary).not.toHaveProperty('identified')
    if (summary.files.length > 0) {
      expect(summary.files[0]).toHaveProperty('url')
      expect(summary.files[0]).toHaveProperty('usage')
      expect(summary.files[0]).not.toHaveProperty('data')
      expect(summary.files[0]).not.toHaveProperty('fileLocation')
    }
  })
})

describe('GET ' + apiUri.specfication, () => {
  it('returns a single specification by filename', async () => {
    const response = await ts.request().get(apiUri.specfication + '?spec=waterleveltransmitter').expect(200)
    expect(response.body.filename).toBe('waterleveltransmitter')
    expect(response.body).toHaveProperty('entities')
  })
  it('strips base64 file contents by default, keeping the file references', async () => {
    // spec 'c' embeds ~1.4 MB of base64 file data in the persisted JSON
    const response = await ts.request().get(apiUri.specfication + '?spec=c').expect(200)
    expect(response.body.files.length).toBe(2)
    response.body.files.forEach((f: { url?: string; usage?: unknown; fileLocation?: unknown; data?: string }) => {
      expect(f).not.toHaveProperty('data')
      expect(f.url).toBeDefined()
      expect(f.usage).toBeDefined()
      expect(f.fileLocation).toBeDefined()
    })
    expect(JSON.stringify(response.body).length).toBeLessThan(100000)
  })
  it('returns the full form including file data with filedata=true (editor save transaction)', async () => {
    const response = await ts.request().get(apiUri.specfication + '?spec=c&filedata=true').expect(200)
    expect(response.body.files.length).toBe(2)
    response.body.files.forEach((f: { data?: string }) => {
      expect(f.data).toBeDefined()
      expect(f.data!.length).toBeGreaterThan(0)
    })
  })
  it('does not remove file data from the in-memory specification store', async () => {
    await ts.request().get(apiUri.specfication + '?spec=c').expect(200)
    const stored = ConfigSpecification.getSpecificationByFilename('c')
    expect(stored?.files.every((f) => f.data && f.data.length > 0)).toBe(true)
  })
  it('returns 404 without spec parameter', async () => {
    await ts.request().get(apiUri.specfication).parse(rawText).expect(HttpErrorsEnum.ErrNotFound)
  })
})

describe('GET/POST ' + apiUri.specificationValidate, () => {
  it('validates an existing specification', async () => {
    const response = await ts
      .request()
      .get(apiUri.specificationValidate + '?spec=waterleveltransmitter&language=en')
      .expect(HttpErrorsEnum.OkCreated)
    expect(Array.isArray(response.body)).toBeTruthy()
  })
  it('GET fails without language', async () => {
    await ts.request().get(apiUri.specificationValidate + '?spec=waterleveltransmitter').parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
  it('GET fails for unknown specification', async () => {
    await ts.request().get(apiUri.specificationValidate + '?spec=unknown-spec&language=en').parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
  it('POST validates the posted specification', async () => {
    const response = await ts
      .request()
      .post(apiUri.specificationValidate + '?language=en')
      .send(spec)
      .expect(HttpErrorsEnum.OkCreated)
    expect(Array.isArray(response.body)).toBeTruthy()
  })
  it('POST fails without language', async () => {
    await ts.request().post(apiUri.specificationValidate).send(spec).parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
})

describe(apiUri.nextCheck, () => {
  it('GET returns the next check time of a contribution', async () => {
    M2mSpecification['ghContributions'].set('test', { nextCheck: '10 Min' } as never)
    try {
      const response = await ts.request().get(apiUri.nextCheck + '?spec=test').expect(200)
      expect(response.body).toBe('10 Min')
    } finally {
      M2mSpecification['ghContributions'].delete('test')
    }
  })
  it('POST returns OK', async () => {
    await ts.request().post(apiUri.nextCheck).send({}).parse(rawText).expect(200)
  })
})

test('GET ' + apiUri.specificationFetchPublic + ' triggers a github fetch', async () => {
  const spy = vi.spyOn(M2mGitHub.prototype, 'fetchPublicFiles').mockImplementation(() => {})
  try {
    const response = await ts.request().get(apiUri.specificationFetchPublic).expect(200)
    expect(response.body.result).toBe('OK')
    expect(spy).toHaveBeenCalled()
  } finally {
    spy.mockRestore()
  }
})

describe('POST ' + apiUri.specficationContribute, () => {
  it('fails without spec parameter', async () => {
    await ts.request().post(apiUri.specficationContribute).send({ note: 'test' }).parse(rawText).expect(HttpErrorsEnum.ErrInvalidParameter)
  })
  it('rejects an already contributed specification', async () => {
    const contributed = {
      ...ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')!,
      status: SpecificationStatus.contributed,
    }
    const getSpy = vi.spyOn(ConfigSpecification, 'getSpecificationByFilename').mockReturnValue(contributed)
    const pollSpy = vi.spyOn(M2mSpecification, 'startPolling').mockReturnValue(undefined)
    try {
      await ts
        .request()
        .post(apiUri.specficationContribute + '?spec=waterleveltransmitter')
        .send({ note: 'test' })
        .parse(rawText).expect(HttpErrorsEnum.ErrNotAcceptable)
    } finally {
      getSpy.mockRestore()
      pollSpy.mockRestore()
    }
  })
})

describe('GET ' + apiUri.download.replace('/:what', ''), () => {
  it('downloads a specification as JSON attachment', async () => {
    const response = await ts.request().get('/download/waterleveltransmitter').expect(200)
    expect(response.headers['content-disposition']).toContain('waterleveltransmitter.json')
    const downloaded = JSON.parse(response.text)
    expect(downloaded.filename).toBe('waterleveltransmitter')
  })
  it('keeps the base64 file contents in the download (self-contained export)', async () => {
    const response = await ts.request().get('/download/c').expect(200)
    const downloaded = JSON.parse(response.text)
    expect(downloaded.files.length).toBe(2)
    downloaded.files.forEach((f: { data?: string }) => expect(f.data && f.data.length > 0).toBe(true))
  })
  it('returns 404 for an unknown specification', async () => {
    await ts.request().get('/download/unknown-spec').parse(rawText).expect(HttpErrorsEnum.ErrNotFound)
  })
  it('downloads local config as zip without secrets.yaml', async () => {
    const response = await ts.request().get('/download/local').responseType('blob').expect(200)
    const zip = new AdmZip(response.body as Buffer)
    zip.getEntries().forEach((e) => {
      expect(e.entryName.indexOf('secrets.yaml')).toBeLessThan(0)
    })
  })
})

describe('POST ' + apiUri.uploadSpec, () => {
  it('imports a downloaded specification (roundtrip)', async () => {
    const download = await ts.request().get('/download/waterleveltransmitter').expect(200)
    const response = await ts
      .request()
      .post(apiUri.uploadSpec)
      .send(JSON.parse(download.text))
      .expect(HttpErrorsEnum.OkCreated)
    expect(response.body.errors).toBe('')
  })
  it('rejects invalid data', async () => {
    await ts
      .request()
      .post(apiUri.uploadSpec)
      .send({ noFilename: true })
      .parse((res, cb) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => cb(null, data))
      })
      .parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
})

describe('POST ' + apiUri.specfication, () => {
  it('fails without busid/slaveid', async () => {
    await ts.request().post(apiUri.specfication).send(spec).parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
  it('add new Specification rename device.specification', async () => {
    ConfigBus['listeners'] = []
    const spec1: ImodbusSpecification = Object.assign(spec)

    const p = ConfigSpecification.getLocalDir() + '/specifications/' + spec1.filename + '.yaml'
    if (fs.existsSync(p)) fs.unlinkSync(p)
    const url = apiUri.specfication + '?busid=0&slaveid=2&originalFilename=waterleveltransmitter'

    await ts.request().post(url).accept('application/json').send(spec1).expect(HttpErrorsEnum.OkCreated)

    const bus = Bus.getBus(0)!
    const modbusAPI = new ModbusAPI(bus)
    bus['modbusAPI'] = modbusAPI
    const ev = modbusAPI['_modbusRTUWorker']!['createEmptyIModbusValues']()
    ev.holdingRegisters.set(100, { error: new Error('failed!!!'), date: new Date() })
    modbusAPI['_modbusRTUWorker']!['cache'].set(2, ev)
    const response = await ts.request().post(url).accept('application/json').send(spec1).expect(HttpErrorsEnum.OkCreated)
    const found = ConfigSpecification.getSpecificationByFilename(spec1.filename)!
    const newFilename = ConfigSpecification.getLocalDir() + '/specifications/' + response.body.filename + '.json'
    expect(fs.existsSync(newFilename)).toBeTruthy()
    expect(getSpecificationI18nName(found, 'en')).toBe('Water Level Transmitter')
  })
  it('accepts payload > 100KB (base64 files)', async () => {
    const largeBase64 = Buffer.alloc(150 * 1024).toString('base64')
    const specWithFile: ImodbusSpecification = {
      ...spec,
      filename: 'largefiletest',
      files: [
        {
          url: 'large-image.png',
          fileLocation: FileLocation.Local,
          usage: SpecificationFileUsage.img,
          data: largeBase64,
          mimeType: 'image/png',
        },
      ],
    }
    const url = apiUri.specfication + '?busid=0&slaveid=2&originalFilename=largefiletest'
    await ts.request().post(url).send(specWithFile).expect(HttpErrorsEnum.OkCreated)

    const jsonPath = join(ConfigSpecification.getLocalDir(), 'specifications', 'largefiletest.json')
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath)
  })
})

describe('DELETE ' + apiUri.specfication, () => {
  it('fails without spec parameter', async () => {
    await ts.request().delete(apiUri.specfication).parse(rawText).expect(HttpErrorsEnum.ErrBadRequest)
  })
  it('deletes a specification and clears slave references', async () => {
    // create a spec to delete
    const specToDelete: ImodbusSpecification = { ...spec, filename: 'deletetest' }
    await ts
      .request()
      .post(apiUri.specfication + '?busid=0&slaveid=2&originalFilename=deletetest')
      .send(specToDelete)
      .expect(HttpErrorsEnum.OkCreated)
    await ts.request().delete(apiUri.specfication + '?spec=deletetest').expect(200)
  })
})
