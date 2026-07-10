import Debug from 'debug'
import { NextFunction, Request, Response } from 'express'
import * as express from 'express'
import { join } from 'path'
import { ConfigSpecification, filesUrlPrefix } from '../../specification/index.js'
import { HttpServerBase } from './httpServerBase.js'
import { createRegistrar } from './routeHelpers.js'
import { createSlaveTopicsMiddleware } from './slaveTopics.js'
import { registerConfigRoutes } from './routes/configRoutes.js'
import { registerSpecificationRoutes } from './routes/specificationRoutes.js'
import { registerBusRoutes } from './routes/busRoutes.js'
import { registerSlaveRoutes } from './routes/slaveRoutes.js'
import { registerModbusRoutes } from './routes/modbusRoutes.js'
import { registerE2eRoutes } from './routes/e2eRoutes.js'

const debug = Debug('httpserver')

/**
 * Composition root of the HTTP API: mounts the specification file statics,
 * the MQTT-slave-topics bridge and the domain route modules (routes/).
 * Lifecycle, statics and auth live in HttpServerBase.
 */
export class HttpServer extends HttpServerBase {
  constructor(angulardir: string = '.') {
    super(angulardir)
  }

  modbusCacheAvailable: boolean = false
  setModbusCacheAvailable() {
    this.modbusCacheAvailable = true
  }

  override initApp() {
    const localdir = join(ConfigSpecification.getLocalDir(), filesUrlPrefix)
    const publicdir = join(ConfigSpecification.getPublicDir(), filesUrlPrefix)
    this.app.get(/.*/, (req: Request, _res: Response, next: NextFunction) => {
      debug(req.url)
      next()
    })
    this.app.use('/' + filesUrlPrefix, express.static(localdir))
    this.app.use('/' + filesUrlPrefix, express.static(publicdir))
    this.app.use(createSlaveTopicsMiddleware())

    const registrar = createRegistrar(this.app)
    registerConfigRoutes(registrar)
    registerSpecificationRoutes(registrar)
    registerBusRoutes(registrar)
    registerSlaveRoutes(registrar)
    registerModbusRoutes(registrar)
    registerE2eRoutes(registrar)
  }
}
