import Debug from 'debug'
import * as http from 'http'
import { Application, NextFunction, Request } from 'express'
import type { ParamsDictionary } from 'express-serve-static-core'
import type { ParsedQs } from 'qs'
import express from 'express'
import { Config, MqttValidationResult } from './config.js'
import { HttpErrorsEnum } from '../shared/specification/index.js'
import { join, basename } from 'path'
import { parse } from 'node-html-parser'
import * as fs from 'fs'
import { LogLevelEnum, Logger } from '../specification/index.js'

import { apiUri } from '../shared/server/index.js'
import { AddressInfo } from 'net'
import { MqttSubscriptions } from './mqttsubscriptions.js'

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
// import cors from 'cors';
//import { IfileSpecification } from './ispecification.js';

export class HttpServerBase {
  protected app: Application
  languages = ['en']
  server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>
  constructor(private angulardir: string = '.') {
    this.app = express()
  }
  private statics = new Map<string, string>()
  private ingressUrl: string = '/'
  returnResult(
    req: express.Request,
    res: http.ServerResponse,
    code: HttpErrorsEnum,
    message: unknown,
    object: unknown = undefined
  ) {
    debugUrl('end: ' + req.path)
    if (code >= 299) {
      log.log(LogLevelEnum.error, '%s: Http Result: %d %s', req.url, code, message)
    } else debug(req.url + ' :' + HttpErrorsEnum[code])
    if (object != undefined) debug('Info: ' + object)
    try {
      res.statusCode = code
      res.end(message)
    } catch (e: unknown) {
      if (e instanceof Error) {
        log.log(LogLevelEnum.error, e.message)
      }
      JSON.stringify(e)
    }
  }
  listen(listenFunction: () => void) {
    this.server = this.app.listen(Config.getConfiguration().httpport, listenFunction)
  }
  close() {
    if (this.server) this.server.close()
  }
  private static getAuthTokenFromHeader(req: Request): string | undefined {
    let authHeader: string | undefined = undefined
    if (req.header) authHeader = req.header('Authorization')
    if (authHeader) {
      const tokenPos = authHeader!.indexOf(' ') + 1
      return authHeader.substring(tokenPos)
    }
    return undefined
  }
  static getAuthTokenFromUrl(url: string): string | undefined {
    const parts = url.split('/')
    const apiIdx = parts.findIndex((part) => ['api', 'download'].includes(part))
    if (apiIdx >= 2) {
      return parts[apiIdx - 1]
    }

    return undefined
  }
  protected static validateUserToken(req: Request, token: string | undefined): MqttValidationResult {
    if (token == undefined) {
      token = HttpServerBase.getAuthTokenFromUrl(req.url)
      if (token == undefined) return MqttValidationResult.error
      req.url = req.url.replace(token + '/', '')
    }
    return Config.validateUserToken(token)
  }

  private getDirectoryForLanguage(req: Request): string {
    let lang = req.acceptsLanguages(['en'])
    if (!lang) lang = 'en'
    return this.statics.get(lang)!
  }

  private initStatics() {
    fs.readdirSync(this.angulardir).forEach((langDir) => {
      const lang = langDir.replace(/-.*/g, '')
      const dir = langDir
      this.statics.set(lang, dir)
    })
    if (this.statics.size > 0) this.languages = Array.from(this.statics.keys())
  }
  get<
    P extends ParamsDictionary = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery extends ParsedQs = ParsedQs,
    Locals extends Record<string, unknown> = Record<string, unknown>,
  >(
    url: apiUri,
    func: (req: express.Request<P, ResBody, ReqBody, ReqQuery, Locals>, response: express.Response<ResBody, Locals>) => void
  ): void {
    debugUrl('start get' + url)
    this.app.get<P, ResBody, ReqBody, ReqQuery, Locals>(url, (req, response) => {
      debug(req.method + ': ' + req.originalUrl)
      func(req, response)
    })
  }
  post<
    P extends ParamsDictionary = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery extends ParsedQs = ParsedQs,
    Locals extends Record<string, unknown> = Record<string, unknown>,
  >(
    url: apiUri,
    func: (req: express.Request<P, ResBody, ReqBody, ReqQuery, Locals>, response: express.Response<ResBody, Locals>) => void
  ): void {
    debugUrl('start post' + url)
    this.app.post<P, ResBody, ReqBody, ReqQuery, Locals>(url, (req, response) => {
      debug(req.method + ': ' + req.originalUrl)
      func(req, response)
    })
  }
  delete<
    P extends ParamsDictionary = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery extends ParsedQs = ParsedQs,
    Locals extends Record<string, unknown> = Record<string, unknown>,
  >(
    url: apiUri,
    func: (req: express.Request<P, ResBody, ReqBody, ReqQuery, Locals>, response: express.Response<ResBody, Locals>) => void
  ): void {
    debugUrl('start delete' + url)
    this.app.delete<P, ResBody, ReqBody, ReqQuery, Locals>(url, (req, response) => {
      debug(req.method + ': ' + req.originalUrl)
      func(req, response)
    })
  }
  validate() {}
  authenticate(req: Request, res: http.ServerResponse, next: NextFunction) {
    // E2E reset endpoint bypasses auth when enabled
    if (process.env.MODBUS2MQTT_E2E && req.url === apiUri.e2eReset) {
      next()
      return
    }
    //  req.header('')
    // All api calls and a user registration when a user is already registered needs authorization
    debugUrl('authenticate' + req.url)
    const config = Config.getConfiguration()
    let token = HttpServerBase.getAuthTokenFromUrl(req.url)
    if (token != undefined) req.url = req.url.replace(token + '/', '')
    else token = HttpServerBase.getAuthTokenFromHeader(req)
    const slaveTopicFound =
      null !=
      MqttSubscriptions.getInstance()
        .getSlaveBaseTopics()
        .find((tp) => tp.startsWith(req.url.substring(1)))
    if (
      req.url.indexOf('/api/') >= 0 ||
      req.url.indexOf('/user/register') >= 0 ||
      req.url.indexOf('/download/') >= 0 ||
      slaveTopicFound
    ) {
      const authStatus = Config.getAuthStatus()
      if (authStatus.hassiotoken) {
        const address = (req.socket.address() as AddressInfo).address
        if (
          !address ||
          (address.indexOf('172.30.33') < 0 &&
            address.indexOf('172.30.32') < 0 &&
            address.indexOf('127.0.0.1') < 0 &&
            address.indexOf('::1') < 0)
        ) {
          log.log(LogLevelEnum.warn, 'Denied: IP Address is not allowed ' + address)
          this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, 'Unauthorized (See server log)')
          return
        }
        debug('Supervisor: validate hassio token')
        next()
        return
      } else {
        if (!config.password || (config.password.length == 0 && req.url.indexOf(apiUri.userRegister) >= 0)) {
          next()
          return
        }
        switch (Config.validateUserToken(token)) {
          case MqttValidationResult.OK:
            next()
            return
          case MqttValidationResult.tokenExpired:
            log.log(LogLevelEnum.error, 'Token expired')
            this.returnResult(req, res, HttpErrorsEnum.ErrUnauthorized, 'Token expired')
            return
          default:
            // case MqttValidationResult.error:
            this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, 'Unauthorized (See server log)')
            return
        }
      }
      // Check addon access
    }

    // No authentication required
    next()
    return
  }

  initApp() {}
  init(): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        Config.executeHassioGetRequest<{ data: IAddonInfo }>(
          '/addons/self/info',
          (info) => {
            //this.ingressUrl = join("/hassio/ingress/", info.data.slug);
            this.ingressUrl = info.data.ingress_entry
            const port = Config.getConfiguration().httpport
            log.log(LogLevelEnum.info, 'Hassio authentication prefix:' + this.ingressUrl + ' modbus2mqtt: ' + port)
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
  }
  private compareIngressUrl(req: Request) {
    const h = req.header('X-Ingress-Path')
    if (h && h != this.ingressUrl) {
      log.log(LogLevelEnum.error, 'Invalid X-Ingress-Path in header expected: ' + this.ingressUrl + 'got: ' + h)
    }
  }

  private sendIndexFile(req: Request, res: express.Response) {
    this.compareIngressUrl(req)
    if (req.url.endsWith('.js')) {
      log.log(LogLevelEnum.info, 'sendIndexfile is serving js file directly: ' + req.url)
    }
    const dir = this.getDirectoryForLanguage(req)
    const file = join(this.angulardir, dir, 'index.html')
    let content = fs.readFileSync(file).toString()
    const htmlDom = parse(content.toString())
    if (this.ingressUrl && content && htmlDom) {
      const base = htmlDom.querySelector('base')
      base?.setAttribute('href', join('/', this.ingressUrl, '/'))
      content = htmlDom.toString()
      res.status(200).setHeader('Content-Type', 'text/html').send(htmlDom.toString())
    } else res.status(401).setHeader('Content-Type', 'text/html').send('Invalid index.html file ')
  }

  /*
   * All angular files are language specific.
   * This method checks if the url is available in a language dependant angular directory
   * E.g. "/en-US/index.html". In this case it returns the files
   * If it's the index file, the base href will be replaced
   */
  private processStaticAngularFiles(req: Request, res: express.Response, next: NextFunction) {
    try {
      const dir = this.getDirectoryForLanguage(req)
      if (dir) {
        res.removeHeader('Content-Type')
        const file = join(this.angulardir, dir, req.url)
        if (fs.existsSync(file) && !fs.lstatSync(file).isDirectory()) {
          if (req.url.indexOf('index.html') >= 0) {
            this.sendIndexFile(req, res)
            return
          } else {
            res.contentType(basename(req.url))
            const content = fs.readFileSync(file)
            log.log(LogLevelEnum.info, 'url' + req.url + ' ct:' + res.getHeader('Content-Type'))
            res.setHeader('Content-Length', content.byteLength)
            res.status(200)
            res.send(content)
            return
          }
        }
      }
      next()
      return
    } catch {
      res.status(401).setHeader('Content-Type', 'text/html').send('No or invalid index.html file ')
    }
  }

  processAll(req: Request, res: express.Response) {
    this.sendIndexFile(req, res)
  }
  initBase() {
    this.initStatics()

    //this.app.use(cors);
    this.app.use(express.json({ limit: '50mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }))
    this.app.use(function (_undefined: unknown, res: http.ServerResponse, next: NextFunction) {
      //            res.setHeader('charset', 'utf-8')
      debug('Authenticate')
      res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS, DELETE, GET')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, X-Accel-Buffering, Accept,Connection,Cache-Control,x-access-token'
      )
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      next()
    })
    // angular files have full path including language e.G. /en-US/polyfill.js
    this.app.use(this.authenticate.bind(this))
    this.app.use(this.processStaticAngularFiles.bind(this))
    this.app.use(express.static(this.angulardir))
    this.app.get('/', (req: Request, res: express.Response) => {
      res.redirect('index.html')
    })
    this.initApp()
    this.app.all(/.*/, this.processAll.bind(this))
  }
}
