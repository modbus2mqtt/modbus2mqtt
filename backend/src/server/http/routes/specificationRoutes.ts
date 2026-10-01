import Debug from 'debug'
import * as express from 'express'
import { Writable } from 'stream'
import { Config } from '../../config.js'
import { ConfigBus } from '../../configbus.js'
import { Bus } from '../../bus.js'
import { ConfigSpecification, M2mGitHub, M2mSpecification, LogLevelEnum, Logger } from '../../../specification/index.js'
import {
  HttpErrorsEnum,
  IimportMessages,
  ImodbusSpecification,
  Ispecification,
  IspecificationSummary,
  SpecificationStatus,
} from '../../../shared/specification/index.js'
import { Islave, apiUri } from '../../../shared/server/index.js'
import { sendResult } from '../sendResult.js'
import { ApiError, Registrar, created, ok, requireQuery, stripSpecFileData } from '../routeHelpers.js'

const debug = Debug('httpserver')
const log = new Logger('httpserver')

export function registerSpecificationRoutes(r: Registrar): void {
  r.get(apiUri.specfication, (ctx) => {
    const spec = ctx.query['spec']
    const specName = spec !== undefined ? String(spec) : ''
    if (specName.length > 0) {
      const rc = ConfigSpecification.getSpecificationByFilename(specName)
      // default: file references only; the editor passes filedata=true for the full,
      // transactional form (base64 file contents included). rc is a structuredClone.
      if (rc && ctx.query['filedata'] !== 'true') stripSpecFileData(rc)
      return ok(rc)
    }
    throw new ApiError(HttpErrorsEnum.ErrNotFound, 'not found')
  })

  r.get(apiUri.specifications, () => {
    const rc: IspecificationSummary[] = []
    new ConfigSpecification().filterAllSpecifications((spec) => {
      rc.push({
        filename: spec.filename,
        model: spec.model,
        manufacturer: spec.manufacturer,
        files: spec.files.map((f) => ({ url: f.url, usage: f.usage, lang: f.lang })),
        status: spec.status,
        i18n: spec.i18n,
        pullUrl: spec.pullUrl,
      })
    })
    return ok(rc)
  })

  r.get(apiUri.nextCheck, (ctx) => {
    const spec = requireQuery(ctx, 'spec')
    return ok(M2mSpecification.getNextCheck(spec))
  })

  r.post(apiUri.nextCheck, () => ({ status: HttpErrorsEnum.OK, body: 'OK' }))

  r.get(apiUri.specificationFetchPublic, () => {
    let ghToken = Config.getConfiguration().githubPersonalToken
    ghToken = ghToken == undefined ? '' : ghToken
    new M2mGitHub(ghToken, ConfigSpecification.getPublicDir()).fetchPublicFiles()
    return ok({ result: 'OK' })
  })

  r.post(apiUri.specfication, (ctx) => {
    debug('POST /specification: ' + String(ctx.query['busid']) + '/' + String(ctx.query['slaveid']))
    const rd = new ConfigSpecification()
    // busid/slaveid are optional: a template can be saved (and a public template
    // cloned into the local dir) even when no modbus connection/device exists yet.
    // When given, the referenced slave is repointed to the saved specification —
    // exactly what the device-register editor needs when cloning a per-device spec.
    const busidRaw = ctx.query['busid']
    const slaveidRaw = ctx.query['slaveid']
    const bus: Bus | undefined = busidRaw !== undefined && busidRaw !== '' ? Bus.getBus(Number.parseInt(busidRaw)) : undefined
    const slave: Islave | undefined =
      bus != undefined && slaveidRaw !== undefined && slaveidRaw !== '' ? bus.getSlaveBySlaveId(Number.parseInt(slaveidRaw)) : undefined

    const originalFilename: string | null =
      ctx.query['originalFilename'] !== undefined ? String(ctx.query['originalFilename']) : null
    const rc = rd.writeSpecification(
      ctx.body as ImodbusSpecification,
      (filename: string) => {
        if (bus != undefined && slave != undefined) {
          slave.specificationid = filename
          ConfigBus.writeslave(bus.getId(), slave)
        }
      },
      originalFilename
    )
    return created(rc)
  })

  r.delete(apiUri.specfication, (ctx) => {
    debug('DELETE /specification: ' + String(ctx.query['spec']))
    const rd = new ConfigSpecification()
    if (ctx.query['spec']) {
      const specName = String(ctx.query['spec'])
      // Block deletion while the template is in use by a device (slave). A slave
      // uses the spec directly via specificationid, or indirectly when it
      // references another slave (referenceSlaveId) that carries it.
      const inUse: string[] = []
      Bus.getBusses().forEach((bus) => {
        bus.getSlaves().forEach((slave) => {
          const owns = slave.specificationid === specName
          if (owns) {
            inUse.push('bus ' + bus.getId() + ' / slave ' + slave.slaveid)
            return
          }
          if (slave.referenceSlaveId != undefined) {
            const ref = bus.getSlaveBySlaveId(slave.referenceSlaveId)
            if (ref && ref.specificationid === specName) inUse.push('bus ' + bus.getId() + ' / slave ' + slave.slaveid + ' (via ' + ref.slaveid + ')')
          }
        })
      })
      if (inUse.length > 0) {
        throw new ApiError(HttpErrorsEnum.ErrConflict, 'Template is in use by: ' + inUse.join(', '))
      }
      const rc = rd.deleteSpecification(specName)
      return ok(rc)
    }
    throw new ApiError(HttpErrorsEnum.ErrBadRequest, 'No specification passed')
  })

  r.post(apiUri.specificationValidate, (ctx) => {
    if (!ctx.query['language'] || String(ctx.query['language']).length == 0) {
      throw new ApiError(HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass language '))
    }
    const spec = new M2mSpecification(ctx.body as Ispecification)
    const messages = spec.validate(String(ctx.query['language']))
    return created(messages)
  })

  r.get(apiUri.specificationValidate, (ctx) => {
    if (!ctx.query['language'] || String(ctx.query['language']).length == 0) {
      throw new ApiError(HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass language '))
    }
    if (!ctx.query['spec'] || String(ctx.query['spec']).length == 0) {
      throw new ApiError(HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass specification '))
    }
    const fspec = ConfigSpecification.getSpecificationByFilename(String(ctx.query['spec']))
    if (!fspec) {
      throw new ApiError(HttpErrorsEnum.ErrBadRequest, JSON.stringify('specification not found ' + String(ctx.query['spec'])))
    }
    const spec = new M2mSpecification(fspec)
    const messages = spec.validate(String(ctx.query['language']))
    return created(messages)
  })

  r.post(apiUri.uploadSpec, (ctx) => {
    try {
      const errors = ConfigSpecification.importSpecificationJson(ctx.body)
      if (errors.errors.length > 0) return { status: HttpErrorsEnum.ErrBadRequest, body: 'Import failed: ' + errors.errors }
      return created(errors)
    } catch (e: unknown) {
      const errors: IimportMessages = { errors: 'Import error: ' + (e as Error).message, warnings: '' }
      return { status: HttpErrorsEnum.ErrNotAcceptable, body: errors.errors }
    }
  })

  // streams a zip / sends a file attachment — stays a raw handler
  r.raw.get(apiUri.download, (req: express.Request, res: express.Response) => {
    debug(req.url)
    if (req.params && req.params['what']) {
      const whatParam = Array.isArray(req.params['what']) ? req.params['what'][0] : (req.params['what'] as string)
      if (whatParam === 'local') {
        // Local config download stays as zip
        res.setHeader('Content-Type', 'application/zip')
        res.setHeader('Content-disposition', 'attachment; filename=local.zip')
        Config.createZipFromLocal('local', res as unknown as Writable)
          .then(() => {
            sendResult(req, res, HttpErrorsEnum.OK, undefined)
          })
          .catch((e) => {
            sendResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify('download local: ' + e.message))
          })
      } else {
        // Spec download as JSON
        const spec = ConfigSpecification.getSpecificationByFilename(whatParam)
        if (!spec) {
          sendResult(req, res, HttpErrorsEnum.ErrNotFound, 'Specification not found: ' + whatParam)
          return
        }
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Content-disposition', 'attachment; filename=' + whatParam + '.json')
        res.end(JSON.stringify(spec, null, 2))
      }
    }
  })

  // long-poll: responds only once the github pull request is merged/closed — stays a raw handler
  r.raw.post(apiUri.specficationContribute, (req: express.Request, res: express.Response) => {
    if (!req.query['spec']) {
      sendResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'specification name not passed')
      return
    }
    const spec = ConfigSpecification.getSpecificationByFilename(String(req.query['spec']))
    const client = new M2mSpecification(spec as Ispecification)
    if (spec && spec.status && ![SpecificationStatus.contributed, SpecificationStatus.published].includes(spec.status)) {
      client
        .contribute(req.body.note)
        .then((response) => {
          // poll status updates of pull request
          M2mSpecification.startPolling(spec.filename, (e) => {
            const msg = e instanceof Error ? e.message : String(e)
            log.log(LogLevelEnum.error, msg)
          })?.subscribe((pullRequest) => {
            if (pullRequest.merged) log.log(LogLevelEnum.info, 'Merged ' + pullRequest.pullNumber)
            else if (pullRequest.closed) log.log(LogLevelEnum.info, 'Closed ' + pullRequest.pullNumber)
            else debug('Polled pullrequest ' + pullRequest.pullNumber)

            if (pullRequest.merged || pullRequest.closed) sendResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(response))
          })
        })
        .catch((err) => {
          res.statusCode = HttpErrorsEnum.ErrNotAcceptable
          if (err.message) res.end(JSON.stringify(err.message))
          else res.end(JSON.stringify(err))
          log.log(LogLevelEnum.error, JSON.stringify(err))
        })
    } else if (spec && spec.status && spec.status == SpecificationStatus.contributed) {
      M2mSpecification.startPolling(spec.filename, (e) => {
        const msg = e instanceof Error ? e.message : String(e)
        log.log(LogLevelEnum.error, msg)
      })
      sendResult(req, res, HttpErrorsEnum.ErrNotAcceptable, 'Specification is already contributed')
    }
  })
}
