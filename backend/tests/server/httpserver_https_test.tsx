import { expect, it, describe, beforeAll, afterAll, afterEach } from 'vitest'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { HttpServerBase } from '../../src/server/http/httpServerBase.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { getAvailablePort, TempConfigDirHelper } from './testhelper.js'
import * as fs from 'fs'
import * as https from 'https'
import * as http from 'http'
import { join } from 'path'
import { execSync } from 'child_process'

setConfigsDirsForTest()

let tempHelper: TempConfigDirHelper

beforeAll(() => {
  tempHelper = new TempConfigDirHelper('httpserver_https_test')
  tempHelper.setup()
  const config = new Config()
  return config.readYamlAsync()
})

afterAll(() => {
  if (tempHelper) tempHelper.cleanup()
})

afterEach(() => {
  delete process.env.MODBUS2MQTT_HTTPS_PORT
  delete process.env.HASSIO_TOKEN
  // Remove any generated test certificates to avoid leaking between tests
  const certPath = join(ConfigPersistence.sslDir, 'fullchain.pem')
  const keyPath = join(ConfigPersistence.sslDir, 'privkey.pem')
  if (fs.existsSync(certPath)) fs.unlinkSync(certPath)
  if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath)
})

/** Test server exposing a probe route without reaching into framework internals */
class ProbeServer extends HttpServerBase {
  registerProbe(): void {
    this.app.get('/', (_req, res) => {
      res.status(200).send('OK')
    })
  }
}

/**
 * Generate self-signed certificates for testing.
 */
function generateTestCertificates(sslDir: string): { certFile: string; keyFile: string } {
  const certFile = 'fullchain.pem'
  const keyFile = 'privkey.pem'
  const certPath = join(sslDir, certFile)
  const keyPath = join(sslDir, keyFile)

  if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir, { recursive: true })
  }

  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
      `-days 1 -nodes -subj "/CN=localhost" 2>/dev/null`
  )

  return { certFile, keyFile }
}

describe('HTTPS server', () => {
  it('should serve HTTP only when no certificates exist in sslDir (auto-detection)', async () => {
    const httpPort = await getAvailablePort()
    const httpsPort = await getAvailablePort()

    process.env.MODBUS2MQTT_HTTPS_PORT = String(httpsPort)

    // Ensure no cert files exist in sslDir
    const certPath = join(ConfigPersistence.sslDir, 'fullchain.pem')
    const keyPath = join(ConfigPersistence.sslDir, 'privkey.pem')
    const certExisted = fs.existsSync(certPath)
    const keyExisted = fs.existsSync(keyPath)

    if (certExisted) fs.renameSync(certPath, certPath + '.bak')
    if (keyExisted) fs.renameSync(keyPath, keyPath + '.bak')

    try {
      const cfg = Config.getConfiguration()
      cfg.httpport = httpPort
      new Config().writeConfiguration(cfg)

      const server = new ProbeServer()
      server.registerProbe()

      await new Promise<void>((resolve) => {
        server.listen(() => {
          expect(server.server).toBeDefined()
          expect(server.httpsServer).toBeUndefined()

          http.get(`http://localhost:${httpPort}/`, (res) => {
            expect(res.statusCode).toBe(200)
            server.close()
            resolve()
          })
        })
      })
    } finally {
      if (certExisted) fs.renameSync(certPath + '.bak', certPath)
      if (keyExisted) fs.renameSync(keyPath + '.bak', keyPath)
    }
  })

  it('should auto-enable HTTPS when certificates exist in sslDir', async () => {
    const httpPort = await getAvailablePort()
    const httpsPort = await getAvailablePort()

    generateTestCertificates(ConfigPersistence.sslDir)

    process.env.MODBUS2MQTT_HTTPS_PORT = String(httpsPort)

    const cfg = Config.getConfiguration()
    cfg.httpport = httpPort
    new Config().writeConfiguration(cfg)

    const server = new ProbeServer()
    server.registerProbe()

    await new Promise<void>((resolve, reject) => {
      server.listen(() => {
        try {
          expect(server.httpsServer).toBeDefined()
          expect(server.server).toBeDefined()

          // HTTPS serves the app
          const agent = new https.Agent({ rejectUnauthorized: false })
          https
            .get(`https://localhost:${httpsPort}/`, { agent }, (res) => {
              expect(res.statusCode).toBe(200)

              // HTTP redirects to HTTPS (302 temporary, see httpServerBase redirect handler)
              http.get(`http://localhost:${httpPort}/test`, (httpRes) => {
                try {
                  expect(httpRes.statusCode).toBe(302)
                  expect(httpRes.headers.location).toContain(`https://`)
                  expect(httpRes.headers.location).toContain(String(httpsPort))
                  server.close()
                  resolve()
                } catch (err) {
                  server.close()
                  reject(err)
                }
              })
            })
            .on('error', (err) => {
              server.close()
              reject(err)
            })
        } catch (err) {
          server.close()
          reject(err)
        }
      })
    })
  })

  it('should serve HTTP only in addon mode (HASSIO_TOKEN disables HTTPS)', async () => {
    const httpPort = await getAvailablePort()

    // Simulate addon mode — HTTPS is disabled
    process.env.HASSIO_TOKEN = 'test-addon-token'
    const cfg = Config.getConfiguration()
    cfg.httpport = httpPort
    expect(cfg.httpsPort).toBeUndefined()
    new Config().writeConfiguration(cfg)

    const server = new ProbeServer()
    server.registerProbe()

    await new Promise<void>((resolve) => {
      server.listen(() => {
        expect(server.server).toBeDefined()
        expect(server.httpsServer).toBeUndefined()

        http.get(`http://localhost:${httpPort}/`, (res) => {
          expect(res.statusCode).toBe(200)
          server.close()
          resolve()
        })
      })
    })
  })
})
