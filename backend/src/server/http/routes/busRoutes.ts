import Debug from 'debug'
import { Bus } from '../../bus.js'
import { HttpErrorsEnum } from '../../../shared/specification/index.js'
import { IBus, apiUri } from '../../../shared/server/index.js'
import { ApiError, Registrar, created, ok } from '../routeHelpers.js'

const debug = Debug('httpserver')

export function registerBusRoutes(r: Registrar): void {
  r.get(apiUri.busses, () => {
    const busses = Bus.getBusses()
    const ibs: IBus[] = []
    busses.forEach((bus) => {
      ibs.push(bus.properties)
    })
    return ok(ibs)
  })

  r.get(apiUri.bus, (ctx) => {
    const busidStr = ctx.query['busid'] ?? ''
    if (busidStr.length) {
      const bus = Bus.getBus(Number.parseInt(busidStr))
      if (bus && bus.properties) {
        return ok(bus.properties)
      }
    }
    throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'invalid Parameter')
  })

  r.post(apiUri.bus, async (ctx) => {
    debug('POST: ' + ctx.url)
    if (ctx.query['busid'] != undefined) {
      const bus = Bus.getBus(parseInt(ctx.query['busid']))
      if (!bus) throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'invalid Parameter')
      try {
        const updated = await bus.updateBus(ctx.body as Parameters<Bus['updateBus']>[0])
        return created({ busid: updated.properties.busId })
      } catch (e) {
        throw new ApiError(HttpErrorsEnum.SrvErrInternalServerError, 'Bus: ' + (e as Error).message)
      }
    }
    try {
      const bus = await Bus.addBus(ctx.body as Parameters<typeof Bus.addBus>[0])
      return created({ busid: bus.properties.busId })
    } catch (e) {
      throw new ApiError(HttpErrorsEnum.SrvErrInternalServerError, (e as Error).message)
    }
  })

  r.delete(apiUri.bus, (ctx) => {
    debug('DELETE /busses: ' + String(ctx.query['busid']))
    if (!ctx.query['busid']) {
      throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'No busid passed')
    }
    Bus.deleteBus(Number.parseInt(ctx.query['busid']))
    return { status: HttpErrorsEnum.OK, body: '' }
  })
}
