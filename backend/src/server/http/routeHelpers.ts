import Debug from 'debug'
import * as express from 'express'
import { HttpErrorsEnum } from '../../shared/specification/index.js'
import { IBus, Islave, apiUri } from '../../shared/server/index.js'
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

/**
 * Removes the base64 file contents (files[].data) from a specification before it goes
 * over HTTP — they can be hundreds of KB per file and most clients only need the file
 * references. The specification editor requests the full form via ?filedata=true so its
 * transactional save (GET full -> edit -> POST full) keeps working unchanged.
 * Mutates and returns the given object — callers must pass a clone
 * (ConfigSpecification.getSpecificationByFilename already returns one), never a live
 * in-memory specification.
 */
export function stripSpecFileData<T extends { files?: { data?: string }[]; publicSpecification?: unknown }>(spec: T): T {
  spec.files?.forEach((f) => delete f.data)
  // the embedded public counterpart carries its own copy of the files
  if (spec.publicSpecification) stripSpecFileData(spec.publicSpecification as T)
  return spec
}

/**
 * The HTTP API decouples slaves from specifications: clients get the specificationid and
 * fetch the specification separately (deduplicated client-side). The full specification
 * object stays attached to the in-memory slaves only — the poller and MQTT discovery
 * depend on it — so strip it from a shallow copy, never from the live object.
 */
export function toApiSlave(slave: Islave): Islave {
  const rc = { ...slave }
  delete rc.specification
  // Never expose the encrypted PAT to the frontend; signal its presence via hasPat instead.
  if (rc.httpPush) {
    const httpPush = { ...rc.httpPush } as typeof rc.httpPush & { hasPat?: boolean }
    httpPush.hasPat = httpPush.patEnc != undefined && httpPush.patEnc.length > 0
    delete httpPush.patEnc
    rc.httpPush = httpPush
  }
  return rc
}

/**
 * Bus payloads embed their slaves, which carry the (potentially large) specification.
 * Return a shallow copy whose slaves are stripped, leaving the live bus/slaves intact.
 */
export function toApiBus(bus: IBus): IBus {
  return { ...bus, slaves: bus.slaves.map(toApiSlave) }
}

/** busid/slaveid are required query parameters of most modbus related routes */
export function requireBusSlave(ctx: Ctx): { busid: number; slaveid: number } {
  const busid = requireQuery(ctx, 'busid')
  const slaveid = requireQuery(ctx, 'slaveid')
  return { busid: Number.parseInt(busid), slaveid: Number.parseInt(slaveid) }
}

export function requireQuery(ctx: Ctx, name: string): string {
  const value = ctx.query[name]
  if (value === undefined || value === '')
    throw new ApiError(HttpErrorsEnum.ErrBadRequest, ctx.url + ': ' + name + ' was not passed')
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
