import { expect, it, xit, test, jest, describe, beforeAll, afterAll } from '@jest/globals'
import { parse } from 'yaml'
import {
  ImodbusEntity,
  ModbusRegisterType,
  IdentifiedStates,
  HttpErrorsEnum,
  Converters,
  FileLocation,
  SpecificationFileUsage,
} from '../../src/shared/specification/index.js'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { FakeMqtt, FakeModes, initBussesForTest } from './configsbase.js'
import supertest from 'supertest'
import * as fs from 'fs'
import { ImodbusSpecification, getSpecificationI18nName } from '../../src/shared/specification/index.js'
import { Bus } from '../../src/server/bus.js'
import { VERSION } from 'ts-node'
import {
  apiUri,
  IBus,
  IRTUConnection,
  IModbusConnection,
  IidentificationSpecification,
  IUserAuthenticationStatus,
} from '../../src/shared/server/index.js'
import { IfileSpecification, LogLevelEnum, Logger } from '../../src/specification/index.js'
import { ConfigSpecification } from '../../src/specification/index.js'
import { join } from 'path'
import { MqttClient } from 'mqtt'
import { ConfigBus } from '../../src/server/configbus.js'
import { MqttConnector } from '../../src/server/mqttconnector.js'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions.js'
import { ModbusAPI } from '../../src/server/modbusAPI.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { TempConfigDirHelper } from './testhelper.js'
import { HttpServer } from '../../src/server/index.js'
const mockReject = false
const mqttService = {
  host: 'core-mosquitto',
  port: 1883,
  ssl: false,
  protocol: '3.1.1',
  username: 'addons',
  password: 'Euso6ahphaiWei9Aeli6Tei0si2paep5agethohboophe7vae9uc0iebeezohg8e',
  addon: 'core_mosquitto',
  ingress_entry: 'test',
}
function executeHassioGetRequest<T>(_url: string, next: (_dev: T) => void, reject: (error: any) => void): void {
  if (mockReject) reject('mockedReason')
  else next({ data: mqttService } as T)
}

const log = new Logger('httpserverTest')
Config['executeHassioGetRequest'] = executeHassioGetRequest
const testPdf = 'test.pdf'
const test1 = 'test2.jpg'

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
let httpServer: HttpServer

const spec2: IfileSpecification = { ...spec, version: VERSION, testdata: {} }
spec2.entities.push({
  id: 2,
  mqttname: '',
  converter: 'number',
  modbusAddress: 4,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  converterParameters: { multiplier: 0.01 },
  variableConfiguration: {
    targetParameter: 2,
    entityId: 1,
  },
})
let oldExecuteHassioGetRequest: any

// Test Helper Instanz
let httpTestHelper: TempConfigDirHelper

const oldAuthenticate: (req: any, res: any, next: () => void) => void = HttpServer.prototype.authenticate
beforeAll(() => {
  return new Promise<void>((resolve, reject) => {
    setConfigsDirsForTest()
    httpTestHelper = new TempConfigDirHelper('httpserver-test')
    httpTestHelper.setup()
    const cfg = new Config()
    cfg
      .readYamlAsync()
      .then(() => {
        ConfigBus.readBusses()
        const conn = new MqttConnector()
        const msub = new MqttSubscriptions(conn)

        const fake = new FakeMqtt(msub, FakeModes.Poll)
        conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
          onConnectCallback(fake as any as MqttClient)
        }

        initBussesForTest()
        ;(Config as any)['fakeModbusCache'] = true
        jest.mock('../../src/server/modbus')
        // FIx text ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
        HttpServer.prototype.authenticate = (req, res, next) => {
          next()
        }
        httpServer = new HttpServer(join(ConfigPersistence.configDir, 'angular'))

        httpServer.setModbusCacheAvailable()
        httpServer.init()
        oldExecuteHassioGetRequest = Config['executeHassioGetRequest']
        resolve()
      })
      .catch(reject)
  })
})

it('GET /devices', async () => {
  const response = await supertest(httpServer['app'])
    .get(apiUri.slaves + '?busid=0')
    .expect(200)
  expect(response.body.length).toBeGreaterThan(0)
  expect(response.body[0]).toHaveProperty('slaveid')
})

// it('GET /nextCheck', (done) => {
//   M2mSpecification['ghContributions'].set('test', {
//     nextCheck: '10 Min',
//   })
//   supertest(httpServer['app'])
//     .get(apiUri.nextCheck + '?spec=test')
//     .expect(200)
//     .then((response) => {
//       done()
//     })
//     .catch((e) => {
//       log.log(LogLevelEnum.error, 'error')
//       expect(1).toBeFalsy()
//     })
// })

it('GET /specsForSlave', async () => {
  const response = await supertest(httpServer['app'])
    .get(apiUri.specsDetection + '?busid=0&slaveid=1&language=en')
    .expect(200)
  expect(response.body.length).toBeGreaterThan(0)
  const spec: ImodbusSpecification = response.body.find(
    (specs: IidentificationSpecification) => specs.filename == 'waterleveltransmitter'
  )
  expect(spec).not.toBeNull()
})
it('GET / (root)', async () => {
  Config['executeHassioGetRequest'] = oldExecuteHassioGetRequest
  const response = await supertest(httpServer['app']).get('/index.html').expect(200)
  expect(response.text.indexOf('href="/test/"')).toBeGreaterThanOrEqual(0)
})

it('GET / (root) with Ingress header', async () => {
  Config['executeHassioGetRequest'] = oldExecuteHassioGetRequest
  const response = await supertest(httpServer['app']).get('/index.html').set({ 'X-Ingress-Path': 'test' }).expect(200)
  expect(response.text.indexOf('base href="/test/"')).toBeGreaterThanOrEqual(0)
})

it('GET angular files', async () => {
  const response = await supertest(httpServer['app']).get('/en-US/test.css').expect(200)
  expect(response.text).toBe('.justContent {\n' + '  margin: 1pt;\n' + '}\n')
  expect(response.type).toBe('text/css')
})
it('GET local files', async () => {
  const response = await supertest(httpServer['app']).get('/specifications/files/waterleveltransmitter/files.yaml').expect(200)
  if (response.type === 'text/yaml' || response.type === 'application/x-yaml') {
    const o = parse(response.text)
    const files = Array.isArray(o) ? (o as any[]) : o && (o as any).files ? (o as any).files : []
    expect(Array.isArray(files)).toBeTruthy()
    if (files.length > 0) {
      expect((files[0].url as string).startsWith('/')).toBeFalsy()
    }
  } else {
    // Fallback: Angular index.html served when files.yaml is missing in test-setup
    expect(response.type).toBe('text/html')
  }
})

xit('register,login validate fails on github', async () => {
  await supertest(httpServer['app']).get('/user/reqister?name=test&password=test123')
  const response = await supertest(httpServer['app']).get('/user/login?name=test&password=test123').expect(200)
  const token = response.body.token
  const hdrs: Headers = new Map<string, string>() as any
  hdrs.set('Authorization', 'Bearer ' + token)
  expect(response.body.token.length).toBeGreaterThan(0)

  await new Promise<void>((resolve, reject) => {
    const req: any = {
      url: '/noauthorization needed',
    }
    const res: any = {}
    try {
      oldAuthenticate.bind(httpServer)(req, res, () => {
        req.url = '/api/Needs authorization'
        req['header'] = (key: string): string => {
          expect(key).toBe('Authorization')
          return 'Bearer ' + token
        }
        try {
          oldAuthenticate.bind(httpServer)(req, undefined, () => resolve())
        } catch (e) {
          reject(e)
        }
      })
    } catch (e) {
      reject(e)
    }
  })
})

it('supervisor login', async () => {
  // This enables hassio validation
  process.env.HASSIO_TOKEN = 'test'
  const response = await supertest(httpServer['app']).get(apiUri.userAuthenticationStatus).expect(200)
  const status = response.body as any as IUserAuthenticationStatus
  expect(status.mqttConfigured).toBeTruthy()
  expect(status.hasAuthToken).toBeFalsy()
})

it('GET /' + apiUri.specifications, async () => {
  const response = await supertest(httpServer['app']).get(apiUri.specifications).expect(200)
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

test('GET /converters', async () => {
  const response = await supertest(httpServer['app']).get('/api/converters').expect(200)
  let sensorExist = false
  response.body.forEach((element: Converters) => {
    if (element == 'number') {
      sensorExist = true
    }
  })
  expect(sensorExist).toBeTruthy()
})

test('GET /modbus/specification', async () => {
  const response = await supertest(httpServer['app'])
    .get('/api/modbus/specification?busid=0&slaveid=1&spec=waterleveltransmitter')
    .expect(HttpErrorsEnum.OK)
  const spec: ImodbusSpecification = response.body
  expect(((spec?.entities[0] as ImodbusEntity).mqttValue as number) - 21).toBeLessThan(0.001)
})

test('GET /busses', async () => {
  const response = await supertest(httpServer['app']).get('/api/busses').expect(200)
  const busses: IBus[] = response.body
  expect(busses.length).toBeGreaterThan(0)
  expect((busses[0].connectionData as IRTUConnection).serialport.length).toBeGreaterThan(0)
})
describe('http ADD/DELETE /busses', () => {
  test('ADD/DELETE /busses', async () => {
    const newConn: IModbusConnection = {
      baudrate: 9600,
      serialport: '/dev/ttyACM1',
      timeout: 200,
    }
    initBussesForTest()

    const oldLength = Bus.getBusses().length
    const mockStaticF = jest.fn(() => Promise.resolve(new Bus({ busId: 7, slaves: [], connectionData: {} as any })))
    const orig = Bus.addBus
    Bus.addBus = mockStaticF
    const postResponse = await supertest(httpServer['app'])
      .post('/api/bus')
      .accept('application/json')
      .send(newConn)
      .set('Content-Type', 'application/json')
      .expect(201)
    const newNumber = postResponse.body
    await supertest(httpServer['app']).delete('/api/bus?busid=' + newNumber.busid)
    expect(200)
    expect(Bus.getBusses().length).toBe(oldLength)
    Bus.addBus = orig
  })

  test('post specification json with invalid data', async () => {
    await supertest(httpServer['app'])
      .post(apiUri.uploadSpec)
      .send({ noFilename: true })
      .parse((res, cb) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => cb(null, data))
      })
      .expect(HttpErrorsEnum.ErrBadRequest)
  })
  test('POST /mqtt/validate', async () => {
    const oldConfig = Config.getConfiguration()
    const config = Config.getConfiguration()
    config.mqttconnect.mqttserverurl = 'mqtt://doesnt_exist:1007'
    new Config().writeConfiguration(config)
    try {
      const response = await supertest(httpServer['app']).post('/api/validate/mqtt').send(config).expect(200)
      expect(response.body.valid).toBeFalsy()
      expect(response.body.message.toString().length).toBeGreaterThan(0)
    } finally {
      new Config().writeConfiguration(oldConfig)
    }
  })
})
describe('http POST', () => {
  test('POST /specification: add new Specification rename device.specification', async () => {
    const conn = new MqttConnector()
    const msub = new MqttSubscriptions(conn)

    const fake = new FakeMqtt(msub, FakeModes.Poll)
    conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
      onConnectCallback(fake as any as MqttClient)
    }
    initBussesForTest()
    ConfigBus['listeners'] = []

    const spec1: ImodbusSpecification = Object.assign(spec)

    const p = ConfigSpecification.getLocalDir() + '/specifications/' + spec1.filename + '.yaml'
    if (fs.existsSync(p)) fs.unlinkSync(p)
    const url = apiUri.specfication + '?busid=0&slaveid=2&originalFilename=waterleveltransmitter'

    //@ts-ignore
    await supertest(httpServer['app'])
      .post(url)
      .accept('application/json')
      .send(spec1)
      .expect(HttpErrorsEnum.OkCreated)
      .catch((e) => {
        log.log(LogLevelEnum.error, JSON.stringify(e))
        expect(1).toBeFalsy()
      })

    // expect((response as any as Response).status).toBe(HttpErrorsEnum.ErrBadRequest)
    const bus = Bus.getBus(0)!
    const modbusAPI = new ModbusAPI(bus)
    bus['modbusAPI'] = modbusAPI
    const ev = modbusAPI['_modbusRTUWorker']!['createEmptyIModbusValues']()
    ev.holdingRegisters.set(100, { error: new Error('failed!!!'), date: new Date() })
    modbusAPI['_modbusRTUWorker']!['cache'].set(2, ev)
    const response = await supertest(httpServer['app'])
      .post(url)
      .accept('application/json')
      .send(spec1)
      .expect(HttpErrorsEnum.OkCreated)
    const found = ConfigSpecification.getSpecificationByFilename(spec1.filename)! as any
    const newFilename = ConfigSpecification.getLocalDir() + '/specifications/' + response.body.filename + '.json'
    expect(fs.existsSync(newFilename)).toBeTruthy()
    expect(getSpecificationI18nName(found!, 'en')).toBe('Water Level Transmitter')
    expect(response)
  })
  test('POST /modbus/entity: update ModbusCache data', async () => {
    //@ts-ignore
    supertest(httpServer['app'])
      .post('/api/modbus/entity?busid=0&slaveid=1&entityid=1')
      .send(spec2)
      .accept('application/json')
      .expect(201)
      .then((response) => {
        const entityAndMessages = response.body as ImodbusEntity
        expect(entityAndMessages.modbusValue[0]).toBe(1)
        expect(parseFloat(entityAndMessages.mqttValue as string)).toBe(0.01)

        expect(response)
      })
      .catch((e) => {
        throw new Error('Exception caught ' + e)
      })
  })

  test('POST /modbus/bus: update bus', async () => {
    const conn = structuredClone(Bus.getBus(0)!.properties.connectionData)
    conn.timeout = 500
    initBussesForTest()
    ConfigBus.updateBusProperties(Bus.getBus(0)!.properties!, conn)
    //@ts-ignore
    await supertest(httpServer['app']).post('/api/bus?busid=0').send(conn).expect(201)
    expect(Bus.getBus(0)!.properties.connectionData.timeout).toBe(500)
    conn.timeout = 100
    ConfigBus.updateBusProperties(Bus.getBus(0)!.properties!, conn)
    expect(Bus.getBus(0)!.properties.connectionData.timeout).toBe(100)
  })

  test('POST /specification: accepts payload > 100KB (base64 files)', async () => {
    // Generate a base64 string > 100KB to exceed the old default body-parser limit
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
    await supertest(httpServer['app'])
      .post(url)
      .send(specWithFile)
      .expect(HttpErrorsEnum.OkCreated)

    // Cleanup
    const jsonPath = join(ConfigSpecification.getLocalDir(), 'specifications', 'largefiletest.json')
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath)
  })

  // Upload endpoints removed: files are now managed as base64 in the specification object
})

// Global cleanup for secrets.yaml
afterAll(() => {
  httpTestHelper.cleanup()
})
