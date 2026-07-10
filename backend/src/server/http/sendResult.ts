import Debug from 'debug'
import * as http from 'http'
import { Request } from 'express'
import { HttpErrorsEnum } from '../../shared/specification/index.js'
import { LogLevelEnum, Logger } from '../../specification/index.js'

const debug = Debug('HttpServerBase')
const debugUrl = Debug('HttpServerBaseUrl')
const log = new Logger('HttpServerBase')

/**
 * Single result funnel for all API handlers: logs the outcome and ends the
 * response with the given status code. Sets a JSON content type unless the
 * handler already chose one (e.g. zip download) or headers are already sent
 * (streaming).
 */
export function sendResult(
  req: Request,
  res: http.ServerResponse,
  code: HttpErrorsEnum,
  message: unknown,
  object: unknown = undefined
): void {
  debugUrl('end: ' + req.path)
  if (code >= 299) {
    log.log(LogLevelEnum.error, '%s: Http Result: %d %s', req.url, code, message)
  } else debug(req.url + ' :' + HttpErrorsEnum[code])
  if (object != undefined) debug('Info: ' + object)
  if (!res.headersSent && !res.getHeader('Content-Type')) {
    try {
      res.setHeader('Content-Type', ' application/json')
    } catch (e) {
      log.log(LogLevelEnum.error, JSON.stringify(e))
    }
  }
  try {
    res.statusCode = code
    res.end(message)
  } catch (e: unknown) {
    if (e instanceof Error) {
      log.log(LogLevelEnum.error, e.message)
    }
  }
}
