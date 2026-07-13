import supertest from 'supertest'
import { join } from 'path'
import { MqttClient } from 'mqtt'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { MqttConnector } from '../../src/server/mqttconnector.js'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions.js'
import { HttpServer } from '../../src/server/index.js'
import { FakeMqtt, FakeModes, initBussesForTest, setConfigsDirsForTest, setConfigsDirsBackendTCPForTest } from './configsbase.js'
import { TempConfigDirHelper } from './testhelper.js'

/** Environment variables the HTTP server reacts to; snapshotted and restored around each test server */
const ENV_KEYS = ['HASSIO_TOKEN', 'MODBUS2MQTT_E2E', 'OIDC_ENABLED']

/** Hassio addon info returned by the mocked supervisor API (ingress_entry drives the <base href> rewrite) */
const hassioAddonInfo = {
  host: 'core-mosquitto',
  port: 1883,
  ssl: false,
  protocol: '3.1.1',
  username: 'addons',
  password: 'Euso6ahphaiWei9Aeli6Tei0si2paep5agethohboophe7vae9uc0iebeezohg8e',
  addon: 'core_mosquitto',
  ingress_entry: 'test',
}

export interface TestServerOptions {
  /** Prefix for the temporary config/data directories */
  name: string
  /** Use the backendTCP fixture dirs instead of the default ones */
  backendTCP?: boolean
  /** Wire a FakeMqtt client into the MqttConnector singleton (default true) */
  fakeMqtt?: boolean
  /** Mock Config.executeHassioGetRequest to return addon info with ingress_entry 'test' (default false) */
  mockHassio?: boolean
  /** Env vars to set BEFORE HttpServer.init() (e.g. { MODBUS2MQTT_E2E: '1' }) */
  env?: Record<string, string>
}

/**
 * supertest parse callback for error responses: the server sends plain text with a
 * json content type, which superagent's default JSON parser refuses to parse.
 *
 * superagent types the parser's first argument as its own Response, while it actually passes the
 * raw IncomingMessage stream. The cast keeps that discrepancy in this one place instead of at each
 * .parse(rawText) call site.
 */
type ParseCallback = Parameters<supertest.Test['parse']>[0]

export const rawText = ((
  res: NodeJS.ReadableStream & { setEncoding(enc: string): void },
  cb: (err: Error | null, body: string) => void
): void => {
  let data = ''
  res.setEncoding('utf8')
  res.on('data', (chunk: string) => (data += chunk))
  res.on('end', () => cb(null, data))
}) as unknown as ParseCallback

export interface TestServer {
  http: HttpServer
  fakeMqtt?: FakeMqtt
  /** supertest agent against the server's request listener — no framework internals involved */
  request(): ReturnType<typeof supertest>
  cleanup(): void
}

/**
 * Creates a fully initialized HttpServer for route tests: temp config dirs, faked MQTT,
 * faked modbus cache and an awaited init(). Call cleanup() in afterAll.
 */
export async function createTestServer(opts: TestServerOptions): Promise<TestServer> {
  // Snapshot env before touching it
  const envSnapshot = new Map<string, string | undefined>()
  for (const key of [...ENV_KEYS, ...Object.keys(opts.env ?? {})]) envSnapshot.set(key, process.env[key])
  if (opts.env) Object.assign(process.env, opts.env)

  if (opts.backendTCP) setConfigsDirsBackendTCPForTest()
  else setConfigsDirsForTest()
  const tempDirs = new TempConfigDirHelper(opts.name)
  tempDirs.setup()

  const oldHassioGetRequest = Config['executeHassioGetRequest']
  if (opts.mockHassio)
    Config['executeHassioGetRequest'] = function <T>(_url: string, next: (dev: T) => void): void {
      next({ data: hassioAddonInfo } as T)
    }

  await new Config().readYamlAsync()
  initBussesForTest()

  let fake: FakeMqtt | undefined
  if (opts.fakeMqtt !== false) {
    MqttConnector.resetInstance()
    MqttSubscriptions.resetInstance()
    const conn = MqttConnector.getInstance()
    const msub = MqttSubscriptions.getInstance()
    fake = new FakeMqtt(msub, FakeModes.Poll)
    conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
      onConnectCallback(fake as unknown as MqttClient)
    }
  }
  ;(Config as unknown as { fakeModbusCache: boolean })['fakeModbusCache'] = true

  const http = new HttpServer(join(ConfigPersistence.configDir, 'angular'))
  http.setModbusCacheAvailable()
  await http.init()

  return {
    http,
    fakeMqtt: fake,
    request: () => supertest(http.requestListener),
    cleanup: () => {
      http.close()
      Config['executeHassioGetRequest'] = oldHassioGetRequest
      for (const [key, value] of envSnapshot) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      MqttConnector.resetInstance()
      MqttSubscriptions.resetInstance()
      tempDirs.cleanup()
    },
  }
}
