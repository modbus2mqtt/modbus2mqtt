import Debug from 'debug'
import { Bus } from '../../bus.js'
import { HttpErrorsEnum } from '../../../shared/specification/index.js'
import { Islave, apiUri } from '../../../shared/server/index.js'
import { ApiError, Registrar, created, ok, requireBusSlave } from '../routeHelpers.js'

const debug = Debug('httpserver')

export function registerSlaveRoutes(r: Registrar): void {
  r.get(apiUri.slaves, (ctx) => {
    if (ctx.query['busid'] !== undefined) {
      const busid = Number.parseInt(ctx.query['busid'])
      const bus = Bus.getBus(busid)
      if (bus) {
        return ok(bus.getSlaves())
      }
    }
    throw new ApiError(HttpErrorsEnum.ErrInvalidParameter, 'Invalid parameter')
  })

  r.get(apiUri.slave, (ctx) => {
    if (ctx.query['busid'] !== undefined && ctx.query['slaveid'] !== undefined) {
      const busid = Number.parseInt(ctx.query['busid'])
      const slaveid = Number.parseInt(ctx.query['slaveid'])
      const slave = Bus.getBus(busid)?.getSlaveBySlaveId(slaveid)
      return ok(slave)
    }
    throw new ApiError(HttpErrorsEnum.ErrInvalidParameter, 'Invalid parameter')
  })

  r.post<Islave>(apiUri.slave, (ctx) => {
    debug('POST /slave: ' + JSON.stringify(ctx.body))
    const busidStr = ctx.query['busid'] ?? ''
    if (busidStr === '') {
      throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'busid was not passed')
    }
    const bus = Bus.getBus(Number.parseInt(busidStr))
    if (!bus) {
      throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + busidStr)
    }
    if (ctx.body.slaveid == undefined) {
      throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'Slave Id is not defined')
    }
    const rc: Islave = bus.writeSlave(ctx.body)
    return created(rc)
  })

  r.delete(apiUri.slave, (ctx) => {
    debug('Delete /slave: ' + String(ctx.query['slaveid']))
    const { busid, slaveid } = requireBusSlave(ctx)
    const bus = Bus.getBus(busid)
    if (bus) bus.deleteSlave(slaveid)
    return { status: HttpErrorsEnum.OK, body: '' }
  })
}
