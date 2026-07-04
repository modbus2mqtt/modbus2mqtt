import Debug from 'debug'
import * as express from 'express'
import { HttpErrorsEnum } from '../../shared/specification/index.js'
import { apiUri } from '../../shared/server/index.js'
import { sendResult } from './sendResult.js'

const debug = Debug('HttpServerBase')

/** Thrown by handlers/validators; the express adapter turns it into an HTTP response. */
export class ApiError extends Error {
  constructor(
    public status: HttpErrorsEnum,
    message: string
  ) {
    super(message)
  }
}

/** Framework-neutral view of a request. */
export interface Ctx<B = unknown> {
  /** original request url including the query string */
  url: string
  query: Record<string, string | undefined>
  params: Record<string, string>
  body: B
}

/** Framework-neutral response: status code plus a pre-serialized body. */
export interface Result {
  status: HttpErrorsEnum
  body?: string
}

export type Handler<B = unknown> = (ctx: Ctx<B>) => Result | Promise<Result>

export const ok = (o: unknown): Result => ({ status: HttpErrorsEnum.OK, body: JSON.stringify(o) })
export const created = (o: unknown): Result => ({ status: HttpErrorsEnum.OkCreated, body: JSON.stringify(o) })

/** busid/slaveid are required query parameters of most modbus related routes */
export function requireBusSlave(ctx: Ctx): { busid: number; slaveid: number } {
  const busid = requireQuery(ctx, 'busid')
  const slaveid = requireQuery(ctx, 'slaveid')
  return { busid: Number.parseInt(busid), slaveid: Number.parseInt(slaveid) }
}

export function requireQuery(ctx: Ctx, name: string): string {
  const value = ctx.query[name]
  if (value === undefined || value === '') throw new ApiError(HttpErrorsEnum.ErrBadRequest, ctx.url + ': ' + name + ' was not passed')
  return value
}

function buildCtx(req: express.Request): Ctx {
  const query: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(req.query)) query[key] = value === undefined ? undefined : String(value)
  return { url: req.originalUrl, query, params: req.params as Record<string, string>, body: req.body }
}

/**
 * The single place where express touches framework-neutral handlers:
 * builds the Ctx, awaits the Result and funnels errors into sendResult.
 */
export function toExpress<B>(h: Handler<B>): express.RequestHandler {
  return (req, res) => {
    Promise.resolve()
      .then(() => h(buildCtx(req) as Ctx<B>))
      .then((r) => sendResult(req, res, r.status, r.body))
      .catch((e) => {
        if (e instanceof ApiError) sendResult(req, res, e.status, e.message)
        else sendResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, e instanceof Error ? e.message : String(e))
      })
  }
}

/**
 * Route registration facade handed to the routes/ modules.
 * `raw` is the escape hatch for handlers that stream, subscribe to observables
 * or need extra middleware — everything else stays framework-neutral.
 */
export interface Registrar {
  get<B = unknown>(url: apiUri, h: Handler<B>): void
  post<B = unknown>(url: apiUri, h: Handler<B>): void
  delete<B = unknown>(url: apiUri, h: Handler<B>): void
  raw: express.Application
}

export function createRegistrar(app: express.Application): Registrar {
  const wrap = <B>(h: Handler<B>): express.RequestHandler => {
    const inner = toExpress(h)
    return (req, res, next) => {
      debug(req.method + ': ' + req.originalUrl)
      inner(req, res, next)
    }
  }
  return {
    get: (url, h) => app.get(url, wrap(h)),
    post: (url, h) => app.post(url, wrap(h)),
    delete: (url, h) => app.delete(url, wrap(h)),
    raw: app,
  }
}
