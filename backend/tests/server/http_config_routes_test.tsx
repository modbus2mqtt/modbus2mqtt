import { describe, it, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { apiUri, IUserAuthenticationStatus } from '../../src/shared/server/index.js'
import { Converters, HttpErrorsEnum } from '../../src/shared/specification/index.js'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { createTestServer, rawText, TestServer } from './httpTestHelper.js'

let ts: TestServer
beforeAll(async () => {
  ts = await createTestServer({ name: 'http-config-routes', mockHassio: true })
})
afterAll(() => ts.cleanup())

describe('GET ' + apiUri.userAuthenticationStatus, () => {
  it('open access: neither hassio token nor OIDC', async () => {
    delete process.env.HASSIO_TOKEN
    const response = await ts.request().get(apiUri.userAuthenticationStatus).expect(200)
    const status = response.body as IUserAuthenticationStatus
    expect(status.hassiotoken).toBeFalsy()
    expect(status.authenticated).toBeFalsy()
  })
  it('supervisor login: hassio token set', async () => {
    process.env.HASSIO_TOKEN = 'test'
    try {
      const response = await ts.request().get(apiUri.userAuthenticationStatus).expect(200)
      const status = response.body as IUserAuthenticationStatus
      expect(status.mqttConfigured).toBeTruthy()
      expect(status.hassiotoken).toBeTruthy()
      expect(status.authenticated).toBeFalsy()
    } finally {
      delete process.env.HASSIO_TOKEN
    }
  })
})

test('GET ' + apiUri.converters, async () => {
  const response = await ts.request().get(apiUri.converters).expect(200)
  const numberExists = (response.body as Converters[]).some((element) => element == 'number')
  expect(numberExists).toBeTruthy()
})

describe(apiUri.configuration, () => {
  it('GET returns the configuration', async () => {
    const response = await ts.request().get(apiUri.configuration).expect(200)
    expect(response.body).toHaveProperty('httpport')
    expect(response.body).toHaveProperty('mqttbasetopic')
  })
  it('GET returns 500 when reading the configuration fails', async () => {
    const spy = vi.spyOn(Config, 'getConfiguration').mockImplementation(() => {
      throw new Error('boom')
    })
    try {
      await ts.request().get(apiUri.configuration).expect(HttpErrorsEnum.SrvErrInternalServerError)
    } finally {
      spy.mockRestore()
    }
  })
  it('POST writes the configuration', async () => {
    const config = Config.getConfiguration()
    await ts.request().post(apiUri.configuration).send(config).expect(HttpErrorsEnum.OkNoContent)
    expect(Config.getConfiguration().httpport).toBe(config.httpport)
  })
})

describe('GET ' + apiUri.sslFiles, () => {
  it('lists files in the ssl directory', async () => {
    const response = await ts.request().get(apiUri.sslFiles).expect(200)
    expect(Array.isArray(response.body)).toBeTruthy()
  })
  it('returns 404 when no ssl directory is configured', async () => {
    const oldSslDir = ConfigPersistence.sslDir
    ConfigPersistence.sslDir = ''
    try {
      // body is plain text ('not found') despite the json content type — parse raw
      await ts
        .request()
        .get(apiUri.sslFiles)
        .parse((res, cb) => {
          let data = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => cb(null, data))
        })
        .expect(HttpErrorsEnum.ErrNotFound)
    } finally {
      ConfigPersistence.sslDir = oldSslDir
    }
  })
})

describe('POST ' + apiUri.validateMqtt, () => {
  it('invalid mqtt url yields valid=false', async () => {
    const oldConfig = Config.getConfiguration()
    const config = Config.getConfiguration()
    config.mqttconnect.mqttserverurl = 'mqtt://doesnt_exist:1007'
    new Config().writeConfiguration(config)
    try {
      const response = await ts.request().post(apiUri.validateMqtt).send(config).expect(200)
      expect(response.body.valid).toBeFalsy()
      expect(response.body.message.toString().length).toBeGreaterThan(0)
    } finally {
      new Config().writeConfiguration(oldConfig)
    }
  })
  it('missing mqttconnect yields valid=false', async () => {
    const response = await ts.request().post(apiUri.validateMqtt).send({}).expect(200)
    expect(response.body.valid).toBeFalsy()
  })
})

test('POST ' + apiUri.translate + ' is not implemented', async () => {
  await ts.request().post(apiUri.translate).send({ contents: ['test'] }).parse(rawText).expect(HttpErrorsEnum.ErrNotAcceptable)
})

test('GET ' + apiUri.serialDevices + ' returns a device list', async () => {
  const response = await ts.request().get(apiUri.serialDevices).expect(200)
  expect(Array.isArray(response.body)).toBeTruthy()
})
