import Debug from 'debug'
import * as express from 'express'
import { Subject } from 'rxjs'
import { Bus } from '../../bus.js'
import { Modbus } from '../../modbus.js'
import { LogLevelEnum, Logger } from '../../../specification/index.js'
import { HttpErrorsEnum, ImodbusSpecification, Ispecification } from '../../../shared/specification/index.js'
import { ModbusTasks, apiUri } from '../../../shared/server/index.js'
import { sendResult } from '../sendResult.js'
import { ApiError, Ctx, Registrar, created, ok, requireBusSlave } from '../routeHelpers.js'

const debug = Debug('httpserver')
const log = new Logger('httpserver')

function requireLanguage(ctx: Ctx): string {
  if (ctx.query['language'] == undefined) {
    throw new Error('language was not passed')
  } else return String(ctx.query['language'])
}

export function registerModbusRoutes(r: Registrar): void {
  r.get(apiUri.specsDetection, async (ctx) => {
    const { busid, slaveid } = requireBusSlave(ctx)
    try {
      const language = requireLanguage(ctx)
      const bus = Bus.getBus(busid)
      if (!bus) throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + busid)
      try {
        const result = await bus.getAvailableSpecs(slaveid, ctx.query['showAllPublicSpecs'] != undefined, language)
        debug('getAvailableSpecs  succeeded ' + slaveid)
        return ok(result)
      } catch (e) {
        throw new ApiError(HttpErrorsEnum.ErrNotFound, 'specsDetection: ' + (e as Error).message)
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e
      throw new ApiError(HttpErrorsEnum.ErrInvalidParameter, 'specsDetection ' + (e as Error).message)
    }
  })

  // responds from an rxjs observable — stays a raw handler
  r.raw.get(apiUri.modbusSpecification, (req: express.Request, res: express.Response) => {
    debug(req.url)
    debug('get specification with modbus data for slave ' + req.query['slaveid'])
    const busidStr = req.query['busid'] !== undefined ? String(req.query['busid']) : ''
    const slaveidStr = req.query['slaveid'] !== undefined ? String(req.query['slaveid']) : ''
    if (busidStr === '') {
      sendResult(req, res, HttpErrorsEnum.ErrBadRequest, req.originalUrl + ': busid was not passed')
      return
    }
    if (slaveidStr === '') {
      sendResult(req, res, HttpErrorsEnum.ErrBadRequest, req.originalUrl + ': slaveid was not passed')
      return
    }
    const bus = Bus.getBus(Number.parseInt(busidStr))
    if (bus === undefined) {
      sendResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + busidStr)
      return
    }
    let modbusTask = ModbusTasks.specification
    if (req.query['deviceDetection'] !== undefined) modbusTask = ModbusTasks.deviceDetection
    const slave = bus.getSlaveBySlaveId(Number.parseInt(slaveidStr))
    if (slave == undefined) {
      sendResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify('invalid slaveid '))
      return
    }
    const specName = req.query['spec'] !== undefined ? String(req.query['spec']) : undefined
    Modbus.getModbusSpecification(modbusTask, bus.getModbusAPI(), slave, specName as unknown as string, (e: unknown) => {
      log.log(LogLevelEnum.error, 'http: get /specification ' + (e as Error).message)
      sendResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify('read specification ' + (e as Error).message))
    }).subscribe((result) => {
      sendResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result))
    })
  })

  // responds from an rxjs subject — stays a raw handler
  r.raw.post(apiUri.modbusEntity, (req: express.Request, res: express.Response) => {
    debug(req.url)
    const busidStr = req.query['busid'] !== undefined ? String(req.query['busid']) : ''
    const slaveidStr = req.query['slaveid'] !== undefined ? String(req.query['slaveid']) : ''
    if (busidStr === '') {
      sendResult(req, res, HttpErrorsEnum.ErrBadRequest, req.originalUrl + ': busid was not passed')
      return
    }
    if (slaveidStr === '') {
      sendResult(req, res, HttpErrorsEnum.ErrBadRequest, req.originalUrl + ': slaveid was not passed')
      return
    }
    const bus = Bus.getBus(Number.parseInt(busidStr))!
    const entityid = req.query['entityid'] ? Number.parseInt(String(req.query['entityid'])) : undefined
    const sub = new Subject<ImodbusSpecification>()
    const subscription = sub.subscribe((result) => {
      subscription.unsubscribe()
      const ent = result.entities.find((e) => e.id == entityid)
      if (ent) {
        sendResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(ent))
      } else {
        sendResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, 'No entity found in specfication')
      }
    })
    Modbus.getModbusSpecificationFromData(ModbusTasks.entity, bus.getModbusAPI(), Number.parseInt(slaveidStr), req.body, sub)
  })

  r.post<Ispecification>(apiUri.writeEntity, async (ctx) => {
    const { busid, slaveid } = requireBusSlave(ctx)
    const bus = Bus.getBus(busid)!
    const mqttValue = ctx.query['mqttValue']
    const entityid = ctx.query['entityid'] ? Number.parseInt(ctx.query['entityid']) : undefined
    if (entityid && mqttValue) {
      try {
        await Modbus.writeEntityMqtt(bus.getModbusAPI(), slaveid, ctx.body, entityid, mqttValue)
        return created('')
      } catch (e) {
        throw new ApiError(HttpErrorsEnum.SrvErrInternalServerError, e instanceof Error ? e.message : String(e))
      }
    }
    throw new ApiError(HttpErrorsEnum.SrvErrInternalServerError, 'No entity found in specfication')
  })
}
