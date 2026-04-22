import Debug from 'debug'
import * as http from 'http'
import os from 'os'
import { Request as ExpressRequest } from 'express'
import * as express from 'express'
import { ConverterMap, filesUrlPrefix, M2mGitHub } from '../specification/index.js'
import { Config } from './config.js'
import type { AuthSession } from './auth/oidc.js'
import { ConfigPersistence } from './persistence/configPersistence.js'
import { Modbus } from './modbus.js'
import {
  ImodbusSpecification,
  HttpErrorsEnum,
  Ispecification,
  IspecificationSummary,
  SpecificationStatus,
  IimportMessages,
} from '../shared/specification/index.js'
import { join } from 'path'
import { Bus } from './bus.js'
import { Subject } from 'rxjs'
import * as fs from 'fs'
import { LogLevelEnum, Logger } from '../specification/index.js'

//import { TranslationServiceClient } from '@google-cloud/translate'
import { M2mSpecification as M2mSpecification } from '../specification/index.js'
import { IUserAuthenticationStatus, IBus, Islave, apiUri, PollModes, ModbusTasks } from '../shared/server/index.js'
import { ConfigSpecification } from '../specification/index.js'
import { HttpServerBase } from './httpServerBase.js'
import { Writable } from 'stream'
import { ConfigBus } from './configbus.js'
import { MqttConnector } from './mqttconnector.js'
import { MqttDiscover } from './mqttdiscover.js'
import { MqttSubscriptions } from './mqttsubscriptions.js'
const debug = Debug('httpserver')
const log = new Logger('httpserver')
// import cors from 'cors';
//import { IfileSpecification } from './ispecification.js';

export class HttpServer extends HttpServerBase {
  constructor(angulardir: string = '.') {
    super(angulardir)
  }

  override returnResult(
    req: ExpressRequest,
    res: http.ServerResponse,
    code: HttpErrorsEnum,
    message: string,
    object: unknown = undefined
  ) {
    if (!res.headersSent)
      try {
        res.setHeader('Content-Type', ' application/json')
      } catch (e) {
        log.log(LogLevelEnum.error, JSON.stringify(e))
      }
    super.returnResult(req, res, code, message, object)
  }
  checkBusidSlaveidParameter(req: express.Request): string {
    const busidStr = req.query['busid'] !== undefined ? String(req.query['busid']) : ''
    const slaveidStr = req.query['slaveid'] !== undefined ? String(req.query['slaveid']) : ''
    if (busidStr === '') return req.originalUrl + ': busid was not passed'
    if (slaveidStr === '') return req.originalUrl + ': slaveid was not passed'
    return ''
  }

  validateMqttConnectionResult(req: ExpressRequest, res: http.ServerResponse, valid: boolean, message: string) {
    const rc = {
      valid: valid,
      message: message,
    }
    this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc))
  }
  getLanguageFromQuery(req: express.Request): string {
    if (req.query['language'] == undefined) {
      throw new Error('language was not passed')
    } else return String(req.query['language'])
  }
  handleSlaveTopics(req: ExpressRequest, res: http.ServerResponse, next: () => void): void {
    const msub = MqttSubscriptions.getInstance()
    const url = req.url.substring(1)
    const slave = msub.getSlave(url)
    if (slave) {
      if (req.method == 'GET' && url.endsWith('/state/')) {
        MqttSubscriptions.readModbus(slave)?.subscribe((spec) => {
          const payload = slave!.getStatePayload(spec.entities)
          this.returnResult(req, res, HttpErrorsEnum.OK, payload)
          return
        })
      } else if (req.method == 'GET' && (url.indexOf('/set/') != -1 || url.indexOf('/set/modbus/') != -1)) {
        let idx = url.indexOf('/set/')
        let postLength = 5
        if (idx == -1) {
          idx = url.indexOf('/set/modbus/')
          postLength = 11
        }
        if (idx == -1) return next() //should not happen
        msub
          .sendEntityCommandWithPublish(slave, url, url.substring(idx + postLength))
          .then(() => {
            this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
          })
          .catch((e) => {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: e.message }))
          })
      } else if (req.method == 'POST' && url.indexOf('/set/') != -1) {
        msub
          .sendCommand(slave, JSON.stringify(req.body))
          .then(() => {
            this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
          })
          .catch((e) => {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: e.message }))
          })
      } else return next()
    } else return next()
  }

  modbusCacheAvailable: boolean = false
  setModbusCacheAvailable() {
    this.modbusCacheAvailable = true
  }
  override initApp() {
    const localdir = join(ConfigSpecification.getLocalDir(), filesUrlPrefix)
    const publicdir = join(ConfigSpecification.getPublicDir(), filesUrlPrefix)
    this.app.get(/.*/, (req: ExpressRequest, res: http.ServerResponse, next) => {
      debug(req.url)
      next()
    })
    this.app.use('/' + filesUrlPrefix, express.static(localdir))
    this.app.use('/' + filesUrlPrefix, express.static(publicdir))
    this.app.use(this.handleSlaveTopics.bind(this))
    this.get(apiUri.userAuthenticationStatus, (req: express.Request, res: express.Response) => {
      debug(req.url)
      req.acceptsLanguages()
      const config = Config.getConfiguration()
      const a: IUserAuthenticationStatus = Config.getAuthStatus()

      const sess = (req as express.Request & { session?: AuthSession }).session
      if (sess?.authenticated) {
        a.authenticated = true
        const user: { name?: string; email?: string } = {}
        if (sess.userName) user.name = sess.userName
        if (sess.userEmail) user.email = sess.userEmail
        a.user = user
      }

      // mqttConfigured is surfaced once auth is satisfied (HA, OIDC-authenticated, or open)
      if (a.hassiotoken || a.authenticated || !a.oidcEnabled) a.mqttConfigured = Config.isMqttConfigured(config.mqttconnect)

      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
      return
    })

    this.get(apiUri.converters, (req: ExpressRequest, res: http.ServerResponse) => {
      debug('(/converters')
      const a = ConverterMap.getConverters()
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
      return
    })
    this.get(apiUri.specsDetection, (req: express.Request, res: http.ServerResponse) => {
      debug(req.url)
      const msg = this.checkBusidSlaveidParameter(req)
      if (msg !== '') {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
      } else {
        const slaveId = Number.parseInt(String(req.query['slaveid']))
        const busid = Number.parseInt(String(req.query['busid']))
        try {
          const language = this.getLanguageFromQuery(req)
          const bus = Bus.getBus(busid)
          if (bus) {
            bus
              .getAvailableSpecs(slaveId, req.query['showAllPublicSpecs'] != undefined, language)
              .then((result) => {
                debug('getAvailableSpecs  succeeded ' + slaveId)
                this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result))
              })
              .catch((e) => {
                this.returnResult(req, res, HttpErrorsEnum.ErrNotFound, 'specsDetection: ' + e.message)
              })
          }
        } catch (e: unknown) {
          this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'specsDetection ' + (e as Error).message)
        }
      }
    })

    this.get(apiUri.sslFiles, (req: ExpressRequest, res: http.ServerResponse) => {
      if (ConfigPersistence.sslDir && ConfigPersistence.sslDir.length) {
        const result = fs.readdirSync(ConfigPersistence.sslDir)
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrNotFound, 'not found')
      }
    })

    this.get(apiUri.specfication, (req: express.Request, res: http.ServerResponse) => {
      const spec = req.query['spec']
      const specName = spec !== undefined ? String(spec) : ''
      if (specName.length > 0) {
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(ConfigSpecification.getSpecificationByFilename(specName)))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrNotFound, 'not found')
      }
    })

    this.get(apiUri.nextCheck, (req: express.Request, res: http.ServerResponse) => {
      debug(req.url)
      const spec = req.query['spec']
      if (spec !== undefined) {
        const nc = M2mSpecification.getNextCheck(String(spec))
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(nc))
      }
    })
    this.post(apiUri.nextCheck, (req: ExpressRequest, res: http.ServerResponse) => {
      debug(req.url)
      this.returnResult(req, res, HttpErrorsEnum.OK, 'OK')
    })
    this.get(apiUri.specifications, (req: ExpressRequest, res: http.ServerResponse) => {
      debug(req.url)
      const rc: IspecificationSummary[] = []
      new ConfigSpecification().filterAllSpecifications((spec) => {
        rc.push({
          filename: spec.filename,
          model: spec.model,
          manufacturer: spec.manufacturer,
          files: spec.files.map((f) => ({ url: f.url, usage: f.usage })),
          status: spec.status,
          i18n: spec.i18n,
          pullUrl: spec.pullUrl,
        })
      })
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc))
    })
    this.get(apiUri.specificationFetchPublic, (req: ExpressRequest, res: http.ServerResponse) => {
      debug(req.url)
      let ghToken = Config.getConfiguration().githubPersonalToken
      ghToken = ghToken == undefined ? '' : ghToken
      new M2mGitHub(ghToken, ConfigSpecification.getPublicDir()).fetchPublicFiles()
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
    })

    this.get(apiUri.busses, (req: ExpressRequest, res: http.ServerResponse) => {
      debug(req.originalUrl)
      const busses = Bus.getBusses()
      const ibs: IBus[] = []
      busses.forEach((bus) => {
        ibs.push(bus.properties)
      })
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(ibs))
    })
    this.get(apiUri.bus, (req: express.Request, res: http.ServerResponse) => {
      debug(req.originalUrl)
      res.statusCode = 200
      const busidStr = req.query['busid'] !== undefined ? String(req.query['busid']) : ''
      if (busidStr.length) {
        const bus = Bus.getBus(Number.parseInt(busidStr))
        if (bus && bus.properties) {
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(bus.properties))
          return
        }
      }
      this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'invalid Parameter')
    })

    this.get(apiUri.slaves, (req: express.Request, res: http.ServerResponse) => {
      const invParam = () => {
        this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'Invalid parameter')
        return
      }
      if (req.query['busid'] !== undefined) {
        const busid = Number.parseInt(String(req.query['busid']))
        const bus = Bus.getBus(busid)
        if (bus) {
          const slaves = bus.getSlaves()
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(slaves))
          return
        } else invParam()
      } else invParam()
    })
    this.get(apiUri.slave, (req: express.Request, res: http.ServerResponse) => {
      if (req.query['busid'] !== undefined && req.query['slaveid'] !== undefined) {
        const busid = Number.parseInt(String(req.query['busid']))
        const slaveid = Number.parseInt(String(req.query['slaveid']))
        const slave = Bus.getBus(busid)?.getSlaveBySlaveId(slaveid)
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(slave))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'Invalid parameter')
      }
    })

    this.get(apiUri.configuration, (req: ExpressRequest, res: http.ServerResponse) => {
      debug('configuration')
      try {
        const config = Config.getConfiguration()
        if (Config.getAuthStatus().hassiotoken) config.rootUrl = 'http://' + os.hostname() + ':' + config.httpport + '/'
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(config))
      } catch (e) {
        log.log(LogLevelEnum.error, 'Error getConfiguration: ' + JSON.stringify(e))
        this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify(e))
      }
    })
    this.get(apiUri.modbusSpecification, (req: express.Request, res: http.ServerResponse) => {
      debug(req.url)
      debug('get specification with modbus data for slave ' + req.query['slaveid'])
      const msg = this.checkBusidSlaveidParameter(req)
      if (msg !== '') {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
        return
      }
      const busid = Number.parseInt(String(req.query['busid']))
      const bus = Bus.getBus(busid)
      if (bus === undefined) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + String(req.query['busid']))
        return
      }
      let modbusTask = ModbusTasks.specification
      if (req.query['deviceDetection'] !== undefined) modbusTask = ModbusTasks.deviceDetection
      const slave = bus.getSlaveBySlaveId(Number.parseInt(String(req.query['slaveid'])))
      if (slave == undefined) {
        this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify('invalid slaveid '))
        return
      }
      const specName = req.query['spec'] !== undefined ? String(req.query['spec']) : undefined
      Modbus.getModbusSpecification(modbusTask, bus.getModbusAPI(), slave, specName as unknown as string, (e: unknown) => {
        log.log(LogLevelEnum.error, 'http: get /specification ' + (e as Error).message)
        this.returnResult(
          req,
          res,
          HttpErrorsEnum.SrvErrInternalServerError,
          JSON.stringify('read specification ' + (e as Error).message)
        )
      }).subscribe((result) => {
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result))
      })
    })
    this.get(apiUri.download, (req: express.Request, res: http.ServerResponse) => {
      debug(req.url)
      if (req.params && req.params['what']) {
        const whatParam = Array.isArray(req.params['what']) ? req.params['what'][0] : (req.params['what'] as string)
        if (whatParam === 'local') {
          // Local config download stays as zip
          res.setHeader('Content-Type', 'application/zip')
          res.setHeader('Content-disposition', 'attachment; filename=local.zip')
          Config.createZipFromLocal('local', res as unknown as Writable)
            .then(() => {
              super.returnResult(req, res, HttpErrorsEnum.OK, undefined)
            })
            .catch((e) => {
              this.returnResult(
                req,
                res,
                HttpErrorsEnum.SrvErrInternalServerError,
                JSON.stringify('download local: ' + e.message)
              )
            })
        } else {
          // Spec download as JSON
          const spec = ConfigSpecification.getSpecificationByFilename(whatParam)
          if (!spec) {
            this.returnResult(req, res, HttpErrorsEnum.ErrNotFound, 'Specification not found: ' + whatParam)
            return
          }
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Content-disposition', 'attachment; filename=' + whatParam + '.json')
          res.end(JSON.stringify(spec, null, 2))
        }
      }
    })
    this.post(apiUri.specficationContribute, (req: express.Request, res: http.ServerResponse) => {
      if (!req.query['spec']) {
        this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'specification name not passed')
        return
      }
      const spec = ConfigSpecification.getSpecificationByFilename(String(req.query['spec']))
      const client = new M2mSpecification(spec as Ispecification)
      if (spec && spec.status && ![SpecificationStatus.contributed, SpecificationStatus.published].includes(spec.status)) {
        client
          .contribute(req.body.note)
          .then((response) => {
            // poll status updates of pull request
            M2mSpecification.startPolling(spec!.filename, (e) => {
              {
                const msg = e instanceof Error ? e.message : String(e)
                log.log(LogLevelEnum.error, msg)
              }
            })?.subscribe((pullRequest) => {
              if (pullRequest.merged) log.log(LogLevelEnum.info, 'Merged ' + pullRequest.pullNumber)
              else if (pullRequest.closed) log.log(LogLevelEnum.info, 'Closed ' + pullRequest.pullNumber)
              else debug('Polled pullrequest ' + pullRequest.pullNumber)

              if (pullRequest.merged || pullRequest.closed)
                this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(response))
            })
          })
          .catch((err) => {
            res.statusCode = HttpErrorsEnum.ErrNotAcceptable
            if (err.message) res.end(JSON.stringify(err.message))
            else res.end(JSON.stringify(err))
            log.log(LogLevelEnum.error, JSON.stringify(err))
          })
      } else if (spec && spec.status && spec.status == SpecificationStatus.contributed) {
        M2mSpecification.startPolling(spec.filename, (e) => {
          {
            const msg = e instanceof Error ? e.message : String(e)
            log.log(LogLevelEnum.error, msg)
          }
        })
        this.returnResult(req, res, HttpErrorsEnum.ErrNotAcceptable, 'Specification is already contributed')
      }
    })

    this.post(apiUri.translate, (req: ExpressRequest, res: http.ServerResponse) => {
      // let client = new TranslationServiceClient()
      // client
      //   .translateText(req.body)
      //   .then((response) => {
      //     let rc: string[] = []
      //     if (response[0].translations) {
      //       response[0].translations.forEach((translation) => {
      //         if (translation.translatedText) rc.push(translation.translatedText)
      //       })
      //       this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc))
      //     }
      //   })
      //   .catch((err: any) => {
      //     res.statusCode = HttpErrorsEnum.ErrNotAcceptable
      //     res.end(JSON.stringify(err.message))
      //     log.log(LogLevelEnum.error, JSON.stringify(err.message))
      //   })
      res.statusCode = HttpErrorsEnum.ErrNotAcceptable
      res.end('Google Translate not implemented')
      log.log(LogLevelEnum.error, 'Google Translate not implemented')
    })

    this.post(apiUri.validateMqtt, (req: ExpressRequest, res: http.ServerResponse) => {
      debug(req.url)
      const config = req.body

      Config.updateMqttTlsConfig(config)
      try {
        if (config.mqttconnect == undefined) {
          this.validateMqttConnectionResult(req, res, false, 'No parameters configured')
          return
        }
        const mqttdiscover = MqttConnector.getInstance()
        const client = req.body.mqttconnect.mqttserverurl ? req.body.mqttconnect : undefined

        mqttdiscover.validateConnection(client, (valid, message) => {
          this.validateMqttConnectionResult(req, res, valid, message)
        })
      } catch (err) {
        log.log(LogLevelEnum.error, err)
      }
    })

    this.post(apiUri.configuration, (req: ExpressRequest, res: http.ServerResponse) => {
      debug('POST: ' + req.url)
      let config = Config.getConfiguration()
      new Config().writeConfiguration(req.body)
      config = Config.getConfiguration()
      ConfigSpecification.setMqttdiscoverylanguage(config.mqttdiscoverylanguage, config.githubPersonalToken)
      this.returnResult(req, res, HttpErrorsEnum.OkNoContent, JSON.stringify(config))
    })
    this.post(apiUri.bus, (req: express.Request, res: http.ServerResponse) => {
      debug('POST: ' + req.url)

      if (req.query['busid'] != undefined) {
        const bus = Bus.getBus(parseInt(String(req.query['busid'])))
        if (bus)
          bus
            .updateBus(req.body)
            .then((bus) => {
              this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify({ busid: bus.properties.busId }))
            })
            .catch((e) => {
              this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, 'Bus: ' + e.message)
            })
      } else
        Bus.addBus(req.body)
          .then((bus) => {
            this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify({ busid: bus.properties.busId }))
          })
          .catch((e) => {
            this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, e.message)
          })
    })

    this.post(apiUri.modbusEntity, (req: express.Request, res: http.ServerResponse) => {
      debug(req.url)
      const msg = this.checkBusidSlaveidParameter(req as unknown as express.Request)
      if (msg !== '') {
        this.returnResult(req as unknown as express.Request, res, HttpErrorsEnum.ErrBadRequest, msg)
        return
      } else {
        const bus = Bus.getBus(Number.parseInt(String(req.query['busid']!)))!
        const entityid = req.query['entityid'] ? Number.parseInt(String(req.query['entityid'])) : undefined
        const sub = new Subject<ImodbusSpecification>()
        const subscription = sub.subscribe((result) => {
          subscription.unsubscribe()
          const ent = result.entities.find((e) => e.id == entityid)
          if (ent) {
            this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(ent))
            return
          } else {
            this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, 'No entity found in specfication')
            return
          }
        })
        Modbus.getModbusSpecificationFromData(
          ModbusTasks.entity,
          bus.getModbusAPI(),
          Number.parseInt(String(req.query['slaveid']!)),
          req.body,
          sub
        )
      }
    })
    this.post(
      apiUri.writeEntity,
      (
        req: ExpressRequest<
          object,
          object,
          Ispecification,
          { busid?: string; slaveid?: string; entityid?: string; mqttValue?: string }
        >,
        res: http.ServerResponse
      ) => {
        debug(req.url)
        const msg = this.checkBusidSlaveidParameter(req as unknown as express.Request)
        if (msg !== '') {
          this.returnResult(req as unknown as express.Request, res, HttpErrorsEnum.ErrBadRequest, msg)
          return
        } else {
          const bus = Bus.getBus(Number.parseInt(String(req.query['busid']!)))!
          const mqttValue = req.query['mqttValue'] !== undefined ? String(req.query['mqttValue']) : undefined
          const entityid = req.query['entityid'] ? Number.parseInt(String(req.query['entityid'])) : undefined
          if (entityid && mqttValue && req.query['slaveid'] != undefined)
            Modbus.writeEntityMqtt(
              bus.getModbusAPI(),
              Number.parseInt(String(req.query['slaveid']!)),
              req.body,
              entityid,
              mqttValue
            )
              .then(() => {
                this.returnResult(req as unknown as express.Request, res, HttpErrorsEnum.OkCreated, '')
              })
              .catch((e) => {
                this.returnResult(req as unknown as express.Request, res, HttpErrorsEnum.SrvErrInternalServerError, e)
              })
          else
            this.returnResult(
              req as unknown as express.Request,
              res,
              HttpErrorsEnum.SrvErrInternalServerError,
              'No entity found in specfication'
            )
        }
      }
    )
    this.get(apiUri.serialDevices, (req: express.Request, res: http.ServerResponse) => {
      debug(req.url)

      ConfigBus.listDevices(
        (devices) => {
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(devices))
        },
        () => {
          // Log the error, but return empty array
          //log.log(LogLevelEnum.info, 'listDevices: ' + error.message)
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify([]), {})
        }
      )
    })

    this.post(apiUri.specfication, (req: express.Request, res: http.ServerResponse) => {
      debug('POST /specification: ' + String(req.query['busid']) + '/' + String(req.query['slaveid']))
      const rd = new ConfigSpecification()
      const msg = this.checkBusidSlaveidParameter(req)
      if (msg !== '') {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "{message: '" + msg + "'}")
        return
      }
      const bus: Bus | undefined = Bus.getBus(Number.parseInt(String(req.query['busid']!)))
      const slave: Islave | undefined = bus ? bus.getSlaveBySlaveId(Number.parseInt(String(req.query['slaveid']!))) : undefined

      const originalFilename: string | null =
        req.query['originalFilename'] !== undefined ? String(req.query['originalFilename']) : null
      const rc = rd.writeSpecification(
        req.body,
        (filename: string) => {
          if (bus != undefined && slave != undefined) {
            slave.specificationid = filename
            ConfigBus.writeslave(bus.getId(), slave)
          }
        },
        originalFilename
      )

      // bus
      //   ?.getAvailableSpecs(Number.parseInt(req.query.slaveid), false)
      //   .then(() => {
      //     debug('Cache updated')
      //   })
      //   .catch((e) => {
      //     debug('getAvailableModbusData failed:' + e.message)
      //   })

      this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc))
    })
    this.post(apiUri.specificationValidate, (req: express.Request, res: http.ServerResponse) => {
      if (!req.query['language'] || String(req.query['language']).length == 0) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass language '))
        return
      }
      const spec = new M2mSpecification(req.body)
      const messages = spec.validate(String(req.query['language']))
      this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(messages))
    })

    this.get(apiUri.specificationValidate, (req: express.Request, res: http.ServerResponse) => {
      if (!req.query['language'] || String(req.query['language']).length == 0) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass language '))
        return
      }
      if (!req.query['spec'] || String(req.query['spec']).length == 0) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass specification '))
        return
      }
      const fspec = ConfigSpecification.getSpecificationByFilename(String(req.query['spec']))
      if (!fspec) {
        this.returnResult(
          req,
          res,
          HttpErrorsEnum.ErrBadRequest,
          JSON.stringify('specification not found ' + String(req.query['spec']))
        )
        return
      }
      const spec = new M2mSpecification(fspec)
      const messages = spec.validate(String(req.query['language']))
      this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(messages))
    })
    this.post(apiUri.slave, (req: express.Request, res: http.ServerResponse) => {
      debug('POST /slave: ' + JSON.stringify(req.body))
      const busidStr = req.query['busid'] !== undefined ? String(req.query['busid']) : ''
      if (busidStr === '') {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'busid was not passed')
        return
      }
      const bus = Bus.getBus(Number.parseInt(busidStr))
      if (!bus) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + busidStr)
        return
      }
      if (req.body.slaveid == undefined) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Slave Id is not defined')
        return
      }

      res.setHeader('charset', 'utf-8')
      res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS, DELETE, GET')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-access-token')
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader('Content-Type', 'application/json')
      const rc: Islave = bus.writeSlave(req.body)
      this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc))
    })
    this.post(apiUri.uploadSpec, (req: ExpressRequest, res: http.ServerResponse) => {
      try {
        const errors = ConfigSpecification.importSpecificationJson(req.body)
        if (errors.errors.length > 0)
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Import failed: ' + errors.errors, errors)
        else this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(errors))
      } catch (e: unknown) {
        const errors: IimportMessages = { errors: 'Import error: ' + (e as Error).message, warnings: '' }
        this.returnResult(req, res, HttpErrorsEnum.ErrNotAcceptable, errors.errors, errors)
      }
    })

    // app.post('/specification',  ( req:express.TypedRequestBody<IfileSpecification>) =>{
    //         debug( req.body.name);
    //    });
    this.delete(apiUri.specfication, (req: express.Request, res: http.ServerResponse) => {
      debug('DELETE /specification: ' + String(req.query['spec']))
      const rd = new ConfigSpecification()
      if (req.query['spec']) {
        const rc = rd.deleteSpecification(String(req.query['spec']))
        Bus.getBusses().forEach((bus) => {
          bus.getSlaves().forEach((slave) => {
            if (slave.specificationid == String(req.query['spec'])) {
              delete slave.specificationid
              if (slave.pollMode == undefined) slave.pollMode = PollModes.intervall
              bus.writeSlave(slave)
            }
          })
        })
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'No specification passed')
      }
    })
    this.delete(apiUri.bus, (req: express.Request, res: http.ServerResponse) => {
      debug('DELETE /busses: ' + String(req.query['busid']))
      if (!req.query['busid']) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'No busid passed')
        return
      }
      Bus.deleteBus(Number.parseInt(String(req.query['busid'])))
      this.returnResult(req, res, HttpErrorsEnum.OK, '')
    })

    this.delete(apiUri.slave, (req: express.Request, res: http.ServerResponse) => {
      debug('Delete /slave: ' + String(req.query['slaveid']))
      const msg = this.checkBusidSlaveidParameter(req)
      if (msg !== '') {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
        return
      }
      const slaveidStr = req.query['slaveid'] !== undefined ? String(req.query['slaveid']) : ''
      const busidStr = req.query['busid'] !== undefined ? String(req.query['busid']) : ''
      if (slaveidStr.length > 0 && busidStr.length > 0) {
        const bus = Bus.getBus(Number.parseInt(busidStr))
        if (bus) bus.deleteSlave(Number.parseInt(slaveidStr))
        this.returnResult(req, res, HttpErrorsEnum.OK, '')
      }
    })

    // E2E test reset endpoint - only available when MODBUS2MQTT_E2E env var is set
    if (process.env.MODBUS2MQTT_E2E) {
      this.post(apiUri.e2eReset, async (req: ExpressRequest, res: http.ServerResponse) => {
        try {
          await this.resetForE2E()
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          log.log(LogLevelEnum.error, 'E2E reset failed: ' + msg)
          this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, msg)
        }
      })
    }
  }

  /**
   * Connect a temporary MQTT client, collect all retained messages, then
   * clear them by publishing empty payloads with retain=true.
   */
  private async clearRetainedMqttMessages(): Promise<void> {
    const mqttConnect = Config.getConfiguration().mqttconnect
    let mqttUrl = mqttConnect?.mqttserverurl
    if (!mqttUrl && Config.mqttHassioLoginData?.mqttserverurl) {
      mqttUrl = Config.mqttHassioLoginData.mqttserverurl
    }
    if (!mqttUrl) return // no MQTT configured – nothing to clear

    const opts = Config.mqttHassioLoginData ?? mqttConnect
    const { connect } = await import('mqtt')
    return new Promise<void>((resolve) => {
      const retainedTopics: string[] = []
      const client = connect(mqttUrl!, {
        username: opts.username,
        password: opts.password as string | undefined,
        clean: true,
        clientId: 'e2e-reset-' + Date.now(),
        connectTimeout: 5000,
      })
      const timer = setTimeout(() => {
        // After collecting retained messages, clear them
        for (const topic of retainedTopics) {
          client.publish(topic, '', { retain: true })
        }
        client.end(false, () => resolve())
      }, 1000)

      client.on('error', () => {
        clearTimeout(timer)
        client.end(true)
        resolve() // don't block reset if MQTT is unreachable
      })
      client.on('connect', () => {
        client.subscribe('#', { qos: 0 })
      })
      client.on('message', (topic, _payload, packet) => {
        if (packet.retain) {
          retainedTopics.push(topic)
        }
      })
    })
  }

  private async resetForE2E(): Promise<void> {
    log.log(LogLevelEnum.info, 'E2E reset: starting')

    // Phase 0: Clear retained MQTT messages before disconnecting
    await this.clearRetainedMqttMessages()

    // Phase 1: Stop active processes
    Bus.resetForE2E()
    MqttDiscover.resetInstance()
    MqttSubscriptions.resetInstance()
    MqttConnector.resetInstance()

    // Phase 2: Clear config state
    ConfigBus.resetForE2E()
    ConfigSpecification.resetForE2E()

    // Phase 3: Clean filesystem
    const localDir = ConfigPersistence.getLocalDir()
    const bussesDir = localDir + '/busses'
    const specsDir = localDir + '/specifications'
    if (fs.existsSync(bussesDir)) fs.rmSync(bussesDir, { recursive: true })
    if (fs.existsSync(specsDir)) fs.rmSync(specsDir, { recursive: true })

    // Phase 4: Reset config (preserves httpport/supervisor_host, rewrites minimal YAML)
    Config.resetForE2E()

    // Phase 5: Re-initialize from (now clean) disk
    await new Config().readYamlAsync()
    new ConfigSpecification().readYaml()
    ConfigBus.readBusses()

    // Phase 6: Re-create MqttDiscover singleton to re-register ConfigBus listeners
    // (addSlave, deleteSlave, updateSlave, deleteBus events for MQTT discovery)
    MqttDiscover.getInstance()

    log.log(LogLevelEnum.info, 'E2E reset: complete')
  }
}
