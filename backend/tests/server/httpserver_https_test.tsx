import { expect, it, describe, beforeAll, afterAll, afterEach } from 'vitest'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { HttpServerBase } from '../../src/server/httpServerBase.js'
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
})

/**
 * Generate self-signed certificates for testing.
 * Returns the sslDir where cert and key files are stored.
 */
function generateTestCertificates(sslDir: string): { certFile: string; keyFile: string } {
  const certFile = 'fullchain.pem'
  const keyFile = 'privkey.pem'
  const certPath = join(sslDir, certFile)
  const keyPath = join(sslDir, keyFile)

  if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir, { recursive: true })
  }

  // Generate self-signed certificate using openssl
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
      `-days 1 -nodes -subj "/CN=localhost" 2>/dev/null`
  )

  return { certFile, keyFile }
}

describe('HTTPS server', () => {
  it('should fall back to HTTP when certificates are missing', async () => {
    const httpPort = await getAvailablePort()
    const httpsPort = await getAvailablePort()

    process.env.MODBUS2MQTT_HTTPS_PORT = String(httpsPort)

    // Ensure no cert files exist in sslDir
    const certPath = join(ConfigPersistence.sslDir, 'fullchain.pem')
    const keyPath = join(ConfigPersistence.sslDir, 'privkey.pem')
    const certExisted = fs.existsSync(certPath)
    const keyExisted = fs.existsSync(keyPath)

    // Temporarily remove certs if they exist
    if (certExisted) fs.renameSync(certPath, certPath + '.bak')
    if (keyExisted) fs.renameSync(keyPath, keyPath + '.bak')

    try {
      const cfg = Config.getConfiguration()
      cfg.httpport = httpPort
      new Config().writeConfiguration(cfg)

      // Create a minimal HttpServerBase (no Angular dir needed for this test)
      const server = new HttpServerBase()
      server['initBase'] = () => {} // Skip Angular init

      await new Promise<void>((resolve) => {
        server.listen(() => {
          // HTTP server should be running
          expect(server.server).toBeDefined()
          // HTTPS server should NOT be running (certs missing)
          expect(server.httpsServer).toBeUndefined()
          server.close()
          resolve()
        })
      })
    } finally {
      // Restore certs
      if (certExisted) fs.renameSync(certPath + '.bak', certPath)
      if (keyExisted) fs.renameSync(keyPath + '.bak', keyPath)
    }
  })

  it('should start HTTPS server when certificates are available', async () => {
    const httpPort = await getAvailablePort()
    const httpsPort = await getAvailablePort()

    const { certFile, keyFile } = generateTestCertificates(ConfigPersistence.sslDir)

    process.env.MODBUS2MQTT_HTTPS_PORT = String(httpsPort)

    const cfg = Config.getConfiguration()
    cfg.httpport = httpPort
    cfg.httpsCertFile = certFile
    cfg.httpsKeyFile = keyFile
    new Config().writeConfiguration(cfg)

    const server = new HttpServerBase()
    // Minimal app setup so Express responds
    server['app'].get('/', (_req, res) => {
      res.status(200).send('OK')
    })

    await new Promise<void>((resolve, reject) => {
      server.listen(() => {
        try {
          expect(server.httpsServer).toBeDefined()
          expect(server.server).toBeDefined()

          // Test HTTPS responds
          const agent = new https.Agent({ rejectUnauthorized: false })
          https
            .get(`https://localhost:${httpsPort}/`, { agent }, (res) => {
              expect(res.statusCode).toBe(200)

              // Test HTTP redirects
              http.get(`http://localhost:${httpPort}/test`, (httpRes) => {
                expect(httpRes.statusCode).toBe(301)
                expect(httpRes.headers.location).toContain(`https://`)
                expect(httpRes.headers.location).toContain(String(httpsPort))
                server.close()
                resolve()
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

  it('should only start HTTP when no httpsPort is configured', async () => {
    const httpPort = await getAvailablePort()

    // No MODBUS2MQTT_HTTPS_PORT set
    const cfg = Config.getConfiguration()
    cfg.httpport = httpPort
    cfg.httpsPort = undefined
    new Config().writeConfiguration(cfg)

    const server = new HttpServerBase()
    server['app'].get('/', (_req, res) => {
      res.status(200).send('OK')
    })

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
