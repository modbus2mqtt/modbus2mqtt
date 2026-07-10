import Debug from 'debug'
import * as http from 'http'
import * as https from 'https'
import { Application, Request } from 'express'
import express from 'express'
import { Config } from '../config.js'
import { HttpErrorsEnum } from '../../shared/specification/index.js'
import { LogLevelEnum, Logger } from '../../specification/index.js'

import { apiUri } from '../../shared/server/index.js'
import { ConfigPersistence } from '../persistence/configPersistence.js'
import { createAuthMiddleware } from './auth/authMiddleware.js'
import { initOidc, registerOidcRoutes, setupSession, type OidcConfig } from './auth/oidc.js'
import { sendResult } from './sendResult.js'
import { AngularStatics } from './angularStatics.js'
import { corsMiddleware } from './corsMiddleware.js'

interface IAddonInfo {
  slug: string
  ingress: boolean
  ingress_entry: string
  ingress_panel: boolean
  ingress_port: number
  ingress_url: string
}

const debug = Debug('HttpServerBase')
const debugUrl = Debug('HttpServerBaseUrl')
const log = new Logger('HttpServerBase')

export class HttpServerBase {
  protected app: Application
  server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>
  httpsServer?: https.Server
  protected oidcConfig: OidcConfig | null = null
  private angularStatics: AngularStatics
  constructor(private angulardir: string = '.') {
    this.app = express()
    this.angularStatics = new AngularStatics(angulardir)
  }
  /** Node-level request listener; lets tests (supertest) drive the server without framework internals */
  get requestListener(): http.RequestListener {
    return this.app
  }
  returnResult(
    req: express.Request,
    res: http.ServerResponse,
    code: HttpErrorsEnum,
    message: unknown,
    object: unknown = undefined
  ) {
    sendResult(req, res, code, message, object)
  }
  listen(listenFunction: () => void) {
    const config = Config.getConfiguration()
    const httpsPort = config.httpsPort

    if (httpsPort) {
      // Auto-detect: check if certificate files exist in sslDir
      const persistence = new ConfigPersistence()
      const certData = persistence.readCertificateFile(config.httpsCertFile)
      const keyData = persistence.readCertificateFile(config.httpsKeyFile)

      if (certData && keyData) {
        // Certificates found — start HTTPS server with the app
        this.httpsServer = https.createServer({ cert: certData, key: keyData }, this.app)
        this.httpsServer.listen(httpsPort, () => {
          log.log(LogLevelEnum.info, `HTTPS listening on port ${httpsPort}`)
          listenFunction()
        })

        // HTTP server only redirects to HTTPS
        const redirectApp = express()
        redirectApp.all(/.*/, (req: Request, res: express.Response) => {
          const host = req.hostname
          const httpsUrl = `https://${host}:${httpsPort}${req.originalUrl}`
          res.redirect(301, httpsUrl)
        })
        this.server = redirectApp.listen(config.httpport, () => {
          log.log(LogLevelEnum.info, `HTTP redirecting to HTTPS on port ${config.httpport}`)
        })
        return
      } else {
        log.log(
          LogLevelEnum.info,
          `HTTPS disabled: certificate files not found (${config.httpsCertFile}, ${config.httpsKeyFile} in ${ConfigPersistence.sslDir})`
        )
      }
    }

    // No HTTPS: HTTP server serves the app directly
    this.server = this.app.listen(config.httpport, listenFunction)
  }
  close() {
    if (this.httpsServer) this.httpsServer.close()
    if (this.server) this.server.close()
  }
  initApp() {}
  init(): Promise<void> {
    return initOidc().then(
      (oidc) =>
        new Promise<void>((resolve) => {
          this.oidcConfig = oidc
          try {
            Config.executeHassioGetRequest<{ data: IAddonInfo }>(
              '/addons/self/info',
              (info) => {
                this.angularStatics.setIngressUrl(info.data.ingress_entry)
                const port = Config.getConfiguration().httpport
                log.log(LogLevelEnum.info, 'Hassio authentication prefix:' + info.data.ingress_entry + ' modbus2mqtt: ' + port)
                this.initBase()
                resolve()
              },
              (e) => {
                const port = Config.getConfiguration().httpport
                log.log(LogLevelEnum.warn, 'Hassio authentication failed ' + e.message + ' modbus2mqtt: ' + port)
                this.initBase()
                resolve()
              }
            )
          } catch {
            this.initBase()
            resolve()
          }
        })
    )
  }

  processAll(req: Request, res: express.Response) {
    this.angularStatics.sendIndexFile(req, res)
  }
  initBase() {
    this.angularStatics.init()

    this.app.use(express.json({ limit: '50mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }))
    this.app.use(corsMiddleware)
    // Session + OIDC routes (only active if OIDC is configured)
    if (this.oidcConfig) {
      setupSession(this.app)
      registerOidcRoutes(this.app, this.oidcConfig)
    }
    // angular files have full path including language e.G. /en-US/polyfill.js
    this.app.use(createAuthMiddleware(this.oidcConfig))
    this.app.use(this.angularStatics.middleware())
    this.app.use(express.static(this.angulardir))
    this.app.get('/', (req: Request, res: express.Response) => {
      res.redirect('index.html')
    })
    this.initApp()
    this.app.all(/.*/, this.processAll.bind(this))
  }
}
