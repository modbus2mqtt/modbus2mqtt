import Debug from 'debug'
import * as express from 'express'
import { Subject } from 'rxjs'
import { Bus } from '../../bus.js'
import { Modbus } from '../../modbus.js'
import { LogLevelEnum, Logger } from '../../../specification/index.js'
import { HttpErrorsEnum, ImodbusSpecification, Ispecification, ModbusRegisterType } from '../../../shared/specification/index.js'
import { ModbusTasks, apiUri } from '../../../shared/server/index.js'
import { sendResult } from '../sendResult.js'
import { scanProbeOk } from './slaveScan.js'
import { ApiError, Ctx, Registrar, created, ok, requireBusSlave, stripSpecFileData } from '../routeHelpers.js'

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
      // default: file references only; the editor passes filedata=true for the full,
      // transactional form. result derives from a structuredClone (getSpecificationByFilename).
      if (req.query['filedata'] !== 'true') stripSpecFileData(result)
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

  // ---- Config register (device configuration) read/write API ----
  // Config registers (category==='config') are not published to MQTT/HA; they are
  // read and written directly to configure the device:
  //   GET /api/modbus/config?busid=&slaveid=&spec=&register=&registerType=  -> raw value
  //   POST /api/modbus/config  body: { spec, entityid, mqttValue } -> write via the entity converter
  r.get(apiUri.configRegister, async (ctx) => {
    const { busid, slaveid } = requireBusSlave(ctx)
    const bus = Bus.getBus(busid)
    if (!bus) throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + busid)
    const reg = Number.parseInt(String(ctx.query['register']))
    const registerType = Number.parseInt(String(ctx.query['registerType'] ?? '3'))
    if (isNaN(reg)) throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'register required')
    try {
      const addresses = new Set([{ address: reg, registerType }])
      const values = await bus.getModbusAPI().readModbusRegister(slaveid, addresses, {
        task: ModbusTasks.poll,
        errorHandling: { retry: true },
      })
      let raw: number | undefined
      switch (registerType) {
        case 4: raw = values.analogInputs.get(reg)?.data?.[0]; break
        case 3: raw = values.holdingRegisters.get(reg)?.data?.[0]; break
        case 1: raw = values.coils.get(reg)?.data?.[0]; break
        default: raw = values.discreteInputs.get(reg)?.data?.[0]; break
      }
      return ok({ register: reg, registerType, value: raw ?? null })
    } catch (e) {
      throw new ApiError(HttpErrorsEnum.SrvErrInternalServerError, e instanceof Error ? e.message : String(e))
    }
  })

  r.post(apiUri.configRegister, async (ctx) => {
    const { busid, slaveid } = requireBusSlave(ctx)
    const bus = Bus.getBus(busid)
    if (!bus) throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + busid)
    const body = ctx.body as { spec?: Ispecification; entityid?: number; mqttValue?: string }
    if (body && body.spec && body.entityid != undefined && body.mqttValue != undefined) {
      try {
        await Modbus.writeEntityMqtt(bus.getModbusAPI(), slaveid, body.spec, body.entityid, body.mqttValue)
        return created('')
      } catch (e) {
        throw new ApiError(HttpErrorsEnum.SrvErrInternalServerError, e instanceof Error ? e.message : String(e))
      }
    }
    throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'spec, entityid and mqttValue required')
  })

  // ---- Slave-ID scan ----
  // Probes slave ids 1..32 first; if none respond, probes 33..256. A slave is
  // considered present when a holding-register read for that unit id actually
  // returns data. The Modbus API resolves with per-address results even when
  // the read failed (the error is stored in the result map, not thrown), so a
  // probe must check for data in the resolved values - otherwise every id in
  // the range looks "present" (see issue: scan always finds slaves).
  r.get(apiUri.scanSlaves, async (ctx) => {
    const busid = ctx.query['busid'] ? Number.parseInt(String(ctx.query['busid'])) : undefined
    if (busid === undefined || isNaN(busid)) throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'busid required')
    const bus = Bus.getBus(busid)
    if (!bus) throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + busid)
    const modbusAPI = bus.getModbusAPI()
    const probe = async (id: number): Promise<boolean> => {
      try {
        const addresses = new Set([{ address: 0, registerType: ModbusRegisterType.HoldingRegister }])
        const values = await modbusAPI.readModbusRegister(id, addresses, {
          task: ModbusTasks.poll,
          errorHandling: { retry: false },
          maxRegistersPerRequest: 1,
        } as never)
        // A failed read is not thrown: it is recorded as {error} in the result
        // map for the probed address. Only a data-bearing result means the
        // slave answered (see scanProbeOk).
        return scanProbeOk(values)
      } catch {
        return false
      }
    }
    const found: number[] = []
    const firstPass = Array.from({ length: 32 }, (_, i) => i + 1)
    for (const id of firstPass) {
      if (await probe(id)) found.push(id)
    }
    if (!found.length) {
      // No slave in 1..32 - scan the remaining 33..256
      for (let id = 33; id <= 256; id++) {
        if (await probe(id)) found.push(id)
      }
    }
    return ok({ slaveIds: found, scanned: found.length ? '1-32' : '1-256' })
  })
}
