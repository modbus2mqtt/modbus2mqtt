import { LogLevelEnum, Logger } from '../../../specification/index.js'
import { HttpErrorsEnum } from '../../../shared/specification/index.js'
import { apiUri } from '../../../shared/server/index.js'
import { resetForE2E } from '../e2eReset.js'
import { ApiError, Registrar, ok } from '../routeHelpers.js'

const log = new Logger('httpserver')

/** E2E test reset endpoint - only registered when the MODBUS2MQTT_E2E env var is set */
export function registerE2eRoutes(r: Registrar): void {
  if (!process.env.MODBUS2MQTT_E2E) return
  r.post(apiUri.e2eReset, async () => {
    try {
      await resetForE2E()
      return ok({ result: 'OK' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.log(LogLevelEnum.error, 'E2E reset failed: ' + msg)
      throw new ApiError(HttpErrorsEnum.SrvErrInternalServerError, msg)
    }
  })
}
