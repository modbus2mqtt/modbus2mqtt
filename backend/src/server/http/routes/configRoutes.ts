import Debug from 'debug'
import * as express from 'express'
import os from 'os'
import { Config } from '../../config.js'
import { ConfigPersistence } from '../../persistence/configPersistence.js'
import { ConfigBus } from '../../configbus.js'
import { Bus } from '../../bus.js'
import { MqttConnector } from '../../mqttconnector.js'
import { MqttDiscover } from '../../mqttdiscover.js'
import { ConverterMap, ConfigSpecification, LogLevelEnum, Logger } from '../../../specification/index.js'
import { HttpErrorsEnum } from '../../../shared/specification/index.js'
import { IUserAuthenticationStatus, Slave, apiUri, debugComponentCatalog } from '../../../shared/server/index.js'
import type { AuthSession } from '../auth/oidc.js'
import { sendResult } from '../sendResult.js'
import { ApiError, Registrar, Result, ok } from '../routeHelpers.js'

const debug = Debug('httpserver')
const log = new Logger('httpserver')

interface ImqttValidate {
  mqttconnect?: { mqttserverurl?: string }
}

export function registerConfigRoutes(r: Registrar): void {
  // needs the express session — stays a raw handler
  r.raw.get(apiUri.userAuthenticationStatus, (req: express.Request, res: express.Response) => {
    debug(req.url)
    const config = Config.getConfiguration()
    const a: IUserAuthenticationStatus = Config.getAuthStatus()

    const sess = (req as express.Request & { session?: AuthSession }).session
    if (sess?.authenticated) {
      a.authenticated = true
      const user: { name?: string; email?: string } = {}
      if (sess.userName) user.name = sess.userName
      if (sess.userEmail) user.email = sess.userEmail
      a.user = user
    }

    // mqttConfigured is surfaced once auth is satisfied (HA, OIDC-authenticated, or open)
    if (a.hassiotoken || a.authenticated || !a.oidcEnabled) a.mqttConfigured = Config.isMqttConfigured(config.mqttconnect)

    sendResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
  })

  r.get(apiUri.converters, () => ok(ConverterMap.getConverters()))

  r.get(apiUri.debugComponents, () => ok(debugComponentCatalog))

  r.get(apiUri.configuration, () => {
    try {
      const config = Config.getConfiguration()
      if (Config.getAuthStatus().hassiotoken) config.rootUrl = 'http://' + os.hostname() + ':' + config.httpport + '/'
      return ok(config)
    } catch (e) {
      log.log(LogLevelEnum.error, 'Error getConfiguration: ' + JSON.stringify(e))
      throw new ApiError(HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify(e))
    }
  })

  r.post(apiUri.configuration, (ctx) => {
    const languageChanged =
      ctx.body && typeof ctx.body === 'object' &&
      'mqttdiscoverylanguage' in ctx.body &&
      ctx.body.mqttdiscoverylanguage !== Config.getConfiguration().mqttdiscoverylanguage
    new Config().writeConfiguration(ctx.body as Parameters<Config['writeConfiguration']>[0])
    const config = Config.getConfiguration()
    ConfigSpecification.setMqttdiscoverylanguage(config.mqttdiscoverylanguage, config.githubPersonalToken)
    // The discovery language used to be applied on the next HTTP poll only
    // (generateDiscoveryPayloads reads the live config), but republishDiscovery
    // only re-announces CHANGED payloads on each poll. When the user changes
    // the discovery language in the webui, republish every subscribed slave
    // right away so Home Assistant gets the translated names without a restart.
    if (languageChanged) {
      Bus.getBusses().forEach((bus) => {
        bus.getSlaves().forEach((islave) => {
          if (!islave.specification) return
          const sl = new Slave(bus.getId(), islave, config.mqttbasetopic)
          try {
            MqttDiscover.getInstance().republishDiscoveryIfChanged(sl)
          } catch (e) {
            log.log(LogLevelEnum.error, 'republish after language change failed: ' + (e instanceof Error ? e.message : String(e)))
          }
        })
      })
    }
    return { status: HttpErrorsEnum.OkNoContent, body: JSON.stringify(config) }
  })

  r.get(apiUri.sslFiles, () => {
    // Always answer with the file list (which falls back to the config dir when
    // the ssl dir is empty/missing) + the path actually browsed, so the UI can
    // show where the files come from instead of a misleading empty state.
    return ok(new ConfigPersistence().listSslFiles())
  })

  r.post(apiUri.translate, () => {
    log.log(LogLevelEnum.error, 'Google Translate not implemented')
    return { status: HttpErrorsEnum.ErrNotAcceptable, body: 'Google Translate not implemented' }
  })

  r.get(
    apiUri.serialDevices,
    () =>
      new Promise<Result>((resolve) => {
        ConfigBus.listDevices(
          (devices) => resolve(ok(devices)),
          // Log the error, but return empty array
          () => resolve(ok([]))
        )
      })
  )

  r.post(
    apiUri.validateMqtt,
    (ctx) =>
      new Promise<Result>((resolve) => {
        const config = ctx.body as ImqttValidate
        Config.updateMqttTlsConfig(config as Parameters<typeof Config.updateMqttTlsConfig>[0])
        try {
          if (config.mqttconnect == undefined) {
            resolve(ok({ valid: false, message: 'No parameters configured' }))
            return
          }
          const connector = MqttConnector.getInstance()
          const client = config.mqttconnect.mqttserverurl ? config.mqttconnect : undefined
          connector.validateConnection(client as Parameters<MqttConnector['validateConnection']>[0], (valid, message) => {
            resolve(ok({ valid, message }))
          })
        } catch (err) {
          log.log(LogLevelEnum.error, err)
        }
      })
  )

  r.raw.post(
    apiUri.uploadLocal,
    express.raw({ type: 'application/zip', limit: '50mb' }),
    (req: express.Request, res: express.Response) => {
      debug(req.url)
      const buffer = req.body as Buffer
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        sendResult(
          req,
          res,
          HttpErrorsEnum.ErrBadRequest,
          JSON.stringify({ ok: false, message: 'No ZIP body received (Content-Type: application/zip required)' })
        )
        return
      }
      Config.importLocalZip(buffer)
        .then(async (result) => {
          if (result.ok) {
            try {
              MqttConnector.resetInstance()
              await new Config().readYamlAsync()
              new ConfigSpecification().readYaml()
              ConfigBus.readBusses()
              await Bus.readBussesFromConfig()
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              log.log(LogLevelEnum.error, 'Post-import reload failed: ' + msg)
              sendResult(
                req,
                res,
                HttpErrorsEnum.SrvErrInternalServerError,
                JSON.stringify({ ok: false, message: 'imported but reload failed: ' + msg })
              )
              return
            }
          }
          sendResult(req, res, result.status as unknown as HttpErrorsEnum, JSON.stringify(result))
        })
        .catch((e) => {
          sendResult(
            req,
            res,
            HttpErrorsEnum.SrvErrInternalServerError,
            JSON.stringify({ ok: false, message: 'import error: ' + (e as Error).message })
          )
        })
    }
  )
}
