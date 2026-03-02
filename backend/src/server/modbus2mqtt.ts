import { Config } from './config.js'
import { ConfigPersistence } from './persistence/configPersistence.js'
import { HttpServer } from './httpserver.js'
import { Bus } from './bus.js'
import { Command } from 'commander'
import { LogLevelEnum, Logger, M2mGitHub, M2mSpecification } from '../specification/index.js'
import * as os from 'os'

import Debug from 'debug'
import { MqttDiscover } from './mqttdiscover.js'
import { ConfigSpecification } from '../specification/index.js'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SpecificationStatus } from '../shared/specification/index.js'
import * as fs from 'fs'
import { ConfigBus } from './configbus.js'
import { CmdlineMigrate } from './CmdlineMigrate.js'
let httpServer: HttpServer | undefined = undefined

process.on('unhandledRejection', (reason, p) => {
  log.log(LogLevelEnum.error, 'Unhandled Rejection at: Promise', p, 'reason:', JSON.stringify(reason))
})
process.on('SIGINT', () => {
  if (httpServer) httpServer.close()
  Bus.stopBridgeServers()
  process.exit(1)
})

const debug = Debug('modbus2mqtt')
const debugAction = Debug('actions')
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MODBUS_NOPOLL: string | undefined
    }
  }
}
//var modbusConfiguration;
let readConfig: Config
const log = new Logger('modbus2mqtt')
export class Modbus2Mqtt {
  pollTasks() {
    debugAction('readBussesFromConfig starts')
    if (Config.getConfiguration().githubPersonalToken)
      new ConfigSpecification().filterAllSpecifications((spec) => {
        if (spec.status == SpecificationStatus.contributed && spec.pullNumber != undefined) {
          M2mSpecification.startPolling(spec.filename, (e) => {
            const msg = e instanceof Error ? e.message : String(e)
            log.log(LogLevelEnum.error, 'Github:' + msg)
          })
        }
      })
  }
  init() {
    const cli = new Command()
    cli.usage('[--ssl <ssl-dir>][--yaml <yaml-dir>][ --port <TCP port>] --term <exit code for SIGTERM>')
    cli.option('-s, --ssl <ssl-dir>', 'set directory for certificates')
    cli.option('-c, --config <config-dir>', 'set directory for add on configuration')
    cli.option('-d, --data <data-dir>', 'set directory for persistent data (public specifications)')
    cli.option('--term <exit code for SIGTERM>', 'sets exit code in case of SIGTERM')
    cli.parse(process.argv)
    const options = cli.opts()
    if (options['data']) {
      ConfigPersistence.dataDir = options['data']
      ConfigSpecification.dataDir = options['data']
    } else {
      ConfigPersistence.dataDir = '.'
      ConfigSpecification.dataDir = '.'
    }
    if (options['config']) {
      ConfigPersistence.configDir = options['config']
      ConfigSpecification.configDir = options['config']
    } else {
      ConfigPersistence.configDir = '.'
      ConfigSpecification.configDir = '.'
    }

    // Perform migration from old structure (data/local) to new (config/modbus2mqtt)
    if (CmdlineMigrate.needsMigration(ConfigPersistence.dataDir, ConfigPersistence.configDir)) {
      log.log(LogLevelEnum.info, 'Detected old directory structure, performing migration...')
      try {
        CmdlineMigrate.migrate(ConfigPersistence.dataDir, ConfigPersistence.configDir)
        log.log(LogLevelEnum.info, 'Migration completed successfully')
      } catch (error) {
        log.log(LogLevelEnum.error, `Migration failed: ${error}`)
        log.log(LogLevelEnum.error, 'Please migrate manually or check permissions')
        // Continue execution - migration failure should not prevent startup
      }
    }

    if (options['term'])
      process.on('SIGTERM', () => {
        process.exit(options['term'])
      })
    if (options['ssl']) ConfigPersistence.sslDir = options['ssl']
    else ConfigPersistence.sslDir = '.'

    readConfig = new Config()
    readConfig.readYamlAsync
      .bind(readConfig)()
      .then(() => {
        ConfigSpecification.setMqttdiscoverylanguage(
          Config.getConfiguration().mqttdiscoverylanguage,
          Config.getConfiguration().githubPersonalToken
        )
        debug(Config.getConfiguration().mqttconnect.mqttserverurl)
        log.log(LogLevelEnum.info, 'Modbus2mqtt version: ' + Config.getConfiguration().appVersion)
        // Prefer configured frontend directory; fallback to Angular build output
        let angulardir = Config.getConfiguration().frontendDir
        if (!angulardir) {
          // Fallback: derive from current module location to dist/frontend/browser (ESM-safe)
          const currentDir = dirname(fileURLToPath(import.meta.url))
          angulardir = join(currentDir, '..', 'frontend', 'browser')
        }
        // Did not work in github workflow for testing

        if (!angulardir || !fs.existsSync(angulardir)) {
          log.log(LogLevelEnum.error, 'Unable to find angular start file ' + angulardir)
          process.exit(2)
        } else log.log(LogLevelEnum.info, 'angulardir is ' + angulardir)
        debug('http root : ' + angulardir)
        const gh = new M2mGitHub(
          Config.getConfiguration().githubPersonalToken ? Config.getConfiguration().githubPersonalToken! : null,
          ConfigSpecification.getPublicDir()
        )
        const startServer = () => {
          MqttDiscover.getInstance()
          ConfigBus.readBusses()
          Bus.readBussesFromConfig().then(() => {
            this.pollTasks()
            debugAction('readBussesFromConfig done')
            debug('Inititialize busses done')
            //execute every 30 minutes
            setInterval(
              () => {
                this.pollTasks()
              },
              30 * 1000 * 60
            )
            if (httpServer)
              httpServer
                .init()
                .then(() => {
                  httpServer!.listen(() => {
                    if (process.env.HASSIO_TOKEN) {
                      log.log(LogLevelEnum.info, 'Running inside Home Assistant Add-On environment')
                    }
                    const cfg = Config.getConfiguration()
                    log.log(LogLevelEnum.info, `modbus2mqtt listening on  ${os.hostname()}: ${cfg.httpport}` +
                      (cfg.httpsPort ? ` (HTTPS: ${cfg.httpsPort})` : ''))
                    // clean cache once per hour
                    setInterval(
                      () => {
                        Bus.cleanupCaches()
                      },
                      1000 * 60 // 1 minute
                    )
                    if (process.env.MODBUS_NOPOLL == undefined) {
                      Bus.getBusses().forEach((bus) => {
                        bus.startPolling()
                      })
                    } else {
                      log.log(LogLevelEnum.info, 'Poll disabled by environment variable MODBUS_POLL')
                    }
                  })
                })
                .catch((e) => {
                  const msg = e instanceof Error ? e.message : String(e)
                  log.log(LogLevelEnum.error, 'Start polling Contributions: ' + msg)
                })
          })
        }
        httpServer = new HttpServer(angulardir)
        debugAction('readBussesFromConfig starts')
        gh.init()
          .catch((e) => {
            const msg = e instanceof Error ? e.message : String(e)
            log.log(LogLevelEnum.error, 'GitHub init failed: ' + msg)
          })
          .finally(startServer)
      })
      .catch((error) => {
        const msg = error instanceof Error ? error.message : String(error)
        log.log(LogLevelEnum.error, 'Unable to read configuration ' + msg)
        process.exit(2)
      })
  }
}
const m = new Modbus2Mqtt()
m.init()

//module.exports = {connectMqtt, init}
