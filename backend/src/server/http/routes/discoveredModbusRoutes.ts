import Debug from 'debug'
import { Bus } from '../../bus.js'
import { HttpErrorsEnum } from '../../../shared/specification/index.js'
import { apiUri } from '../../../shared/server/index.js'
import { ApiError, Registrar, ok } from '../routeHelpers.js'
import { ModbusAutoDiscover } from '../../ModbusAutoDiscover.js'

const debug = Debug('httpserver')

export function registerDiscoveredModbusRoutes(r: Registrar): void {
  // List currently discovered Modbus TCP servers (blacklisted ones excluded)
  r.get(apiUri.discoveredModbusServers, () => {
    return ok(ModbusAutoDiscover.getInstance().getDiscoveredServers())
  })

  // Add a discovered server as a Modbus TCP bus
  r.post(apiUri.discoveredModbusAdd, async (ctx) => {
    const body = ctx.body as { host?: string; port?: number } | undefined
    const host = body?.host
    const port = body?.port
    if (!host || !port) throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'host and port required')
    try {
      const bus = await Bus.addBus({ host, port, timeout: 1000 } as never)
      return ok({ busid: bus.properties.busId })
    } catch (e) {
      throw new ApiError(HttpErrorsEnum.SrvErrInternalServerError, 'Bus: ' + (e as Error).message)
    }
  })

  // Ignore a discovered server: add host:port to the blacklist
  r.post(apiUri.discoveredModbusIgnore, (ctx) => {
    const body = ctx.body as { host?: string; port?: number } | undefined
    const host = body?.host
    const port = body?.port
    if (!host || !port) throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'host and port required')
    ModbusAutoDiscover.getInstance().blacklistServer(host, port)
    return ok({ ignored: host + ':' + port })
  })
}
