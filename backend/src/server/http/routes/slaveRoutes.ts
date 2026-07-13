import Debug from 'debug'
import { Bus } from '../../bus.js'
import { SlaveReferencedError } from '../../configbus.js'
import { HttpErrorsEnum } from '../../../shared/specification/index.js'
import { Islave, apiUri } from '../../../shared/server/index.js'
import { ApiError, Registrar, created, ok, requireBusSlave, toApiSlave } from '../routeHelpers.js'
import { encryptSecret } from '../../secureSecret.js'

const debug = Debug('httpserver')

export function registerSlaveRoutes(r: Registrar): void {
  r.get(apiUri.slaves, (ctx) => {
    if (ctx.query['busid'] !== undefined) {
      const busid = Number.parseInt(ctx.query['busid'])
      const bus = Bus.getBus(busid)
      if (bus) {
        return ok(bus.getSlaves().map(toApiSlave))
      }
    }
    throw new ApiError(HttpErrorsEnum.ErrInvalidParameter, 'Invalid parameter')
  })

  r.get(apiUri.slave, (ctx) => {
    if (ctx.query['busid'] !== undefined && ctx.query['slaveid'] !== undefined) {
      const busid = Number.parseInt(ctx.query['busid'])
      const slaveid = Number.parseInt(ctx.query['slaveid'])
      const slave = Bus.getBus(busid)?.getSlaveBySlaveId(slaveid)
      return ok(slave ? toApiSlave(slave) : slave)
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
    // A reference must point to another, non-referencing slave of the same bus. Rejecting a chain here
    // is what keeps the inheritance one level deep and free of cycles.
    const referenceSlaveId = (ctx.body as Islave).referenceSlaveId
    if (referenceSlaveId != undefined) {
      if (referenceSlaveId === ctx.body.slaveid)
        throw new ApiError(HttpErrorsEnum.ErrInvalidParameter, 'Slave ' + ctx.body.slaveid + ' cannot reference itself')
      const root = bus.getSlaveBySlaveId(referenceSlaveId)
      if (root == undefined)
        throw new ApiError(
          HttpErrorsEnum.ErrInvalidParameter,
          'Referenced slave ' + referenceSlaveId + ' does not exist on bus ' + busidStr
        )
      if (root.referenceSlaveId != undefined)
        throw new ApiError(
          HttpErrorsEnum.ErrInvalidParameter,
          'Referenced slave ' + referenceSlaveId + ' is a reference itself. References are one level deep.'
        )
    }
    const incoming = ctx.body as Islave & { httpPush?: { pat?: string; hasPat?: boolean } }
    if (incoming.httpPush) {
      const existing = bus.getSlaveBySlaveId(incoming.slaveid)
      const pat = incoming.httpPush.pat
      if (typeof pat === 'string' && pat.length > 0) {
        // New/changed plaintext PAT: encrypt at rest.
        incoming.httpPush.patEnc = encryptSecret(pat)
      } else if (existing?.httpPush?.patEnc) {
        // Unchanged: keep the previously stored encrypted PAT.
        incoming.httpPush.patEnc = existing.httpPush.patEnc
      }
      delete incoming.httpPush.pat
      delete incoming.httpPush.hasPat
    }
    const rc: Islave = bus.writeSlave(incoming)
    return created(toApiSlave(rc))
  })

  r.delete(apiUri.slave, (ctx) => {
    debug('Delete /slave: ' + String(ctx.query['slaveid']))
    const { busid, slaveid } = requireBusSlave(ctx)
    const bus = Bus.getBus(busid)
    // Deleting a referenced slave would leave its references without a configuration. It only succeeds
    // when the client explicitly asks to detach them (they keep the inherited values as their own).
    const detachReferences = ctx.query['detachReferences'] === 'true'
    try {
      if (bus) bus.deleteSlave(slaveid, detachReferences)
    } catch (e) {
      if (e instanceof SlaveReferencedError) throw new ApiError(HttpErrorsEnum.ErrConflict, e.message)
      throw e
    }
    return { status: HttpErrorsEnum.OK, body: '' }
  })
}
