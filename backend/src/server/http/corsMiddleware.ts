import Debug from 'debug'
import { NextFunction, Request, Response } from 'express'

const debug = Debug('HttpServerBase')

/**
 * Manual CORS handling. Echoes the request Origin instead of '*': a wildcard
 * origin is rejected by browsers when Access-Control-Allow-Credentials is 'true'
 * (OIDC sends the session cookie via withCredentials), which surfaces as a CORS error.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  debug('Authenticate')
  const origin = req.headers.origin
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS, DELETE, GET')
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Vary', 'Origin')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, X-Accel-Buffering, Accept,Connection,Cache-Control,x-access-token'
  )
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  next()
}
