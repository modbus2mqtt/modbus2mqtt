import Debug from 'debug'
import { join } from 'path'
import packageJson from '../../package.json' with { type: 'json' }
import { Subject } from 'rxjs'
import { getBaseFilename } from '../shared/specification/index.js'
import jwt, { JwtPayload } from 'jsonwebtoken'
import * as bcrypt from 'bcryptjs'
import { LogLevelEnum, Logger, filesUrlPrefix } from '../specification/index.js'
import { ImqttClient, AuthenticationErrors, Iconfiguration, IUserAuthenticationStatus } from '../shared/server/index.js'
import { Bus } from './bus.js'
import { IClientOptions } from 'mqtt'
import { ConfigPersistence } from './persistence/configPersistence.js'
const CONFIG_VERSION = '0.1'
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      HASSIO_TOKEN: string
      MODBUS2MQTT_HTTPS_PORT?: string
    }
  }
}

export {}
const DEFAULT_MQTT_CONNECT_TIMEOUT = 60 * 1000
const HASSIO_TIMEOUT = 3000
export enum MqttValidationResult {
  OK = 0,
  tokenExpired = 1,
  error = 2,
}
export enum ConfigListenerEvent {
  addSlave,
  deleteSlave,
  updateSlave,
  deleteBus,
}
const log = new Logger('config')
const debugAddon = Debug('config.addon')
const saltRounds = 8
const defaultTokenExpiryTime = 1000 * 60 * 60 * 24 // One day
export class Config {
  static tokenExpiryTime: number = defaultTokenExpiryTime
  static mqttHassioLoginData: ImqttClient | undefined = undefined
  private static persistence: ConfigPersistence

  static async login(name: string, password: string): Promise<string> {
    if (Config.config.noAuthentication) {
      log.log(LogLevelEnum.error, 'Login called, but noAuthentication is configured')
      throw AuthenticationErrors.InvalidParameters
    }

    if (Config.config && Config.config.username && Config.config.password) {
      // Login
      if (name === Config.config.username) {
        let success = false
        try {
          success = await bcrypt.compare(password, Config.config.password)
        } catch (err) {
          log.log(LogLevelEnum.error, 'login: compare failed: ' + err)
          throw AuthenticationErrors.InvalidParameters
        }
        if (success) {
          try {
            const s = jwt.sign({ password: password }, Config.secret, {
              expiresIn: Math.floor(Config.tokenExpiryTime / 1000),
              algorithm: 'HS256',
            })
            return s
          } catch (err) {
            log.log(LogLevelEnum.error, err)
            throw AuthenticationErrors.SignError
          }
        } else {
          throw AuthenticationErrors.InvalidUserPasswordCombination
        }
      } else {
        log.log(LogLevelEnum.error, 'login: Username was not set')
        throw AuthenticationErrors.InvalidParameters
      }
    }
    throw AuthenticationErrors.InvalidParameters
  }
  static async register(name: string | undefined, password: string | undefined, noAuthentication: boolean): Promise<void> {
    if (noAuthentication == true) {
      Config.config.noAuthentication = true
      new Config().writeConfiguration(Config.config)
      return
    } else if (Config.config && password) {
      const enc = await bcrypt.hash(password, saltRounds)
      Config.config.password = enc
      Config.config.username = name
      new Config().writeConfiguration(Config.config)
    } else {
      throw AuthenticationErrors.InvalidParameters
    }
  }
  static validateUserToken(token: string | undefined): MqttValidationResult {
    if (this.config.noAuthentication) return MqttValidationResult.OK
    if (token == undefined) return MqttValidationResult.error

    try {
      const payload = jwt.verify(token, Config.secret) as JwtPayload & { password: string }
      if (bcrypt.compareSync(payload.password, Config.config.password!)) {
        return MqttValidationResult.OK
      }
      return MqttValidationResult.error
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'name' in err && (err as { name?: string }).name === 'TokenExpiredError') {
        return MqttValidationResult.tokenExpired
      }
      log.log(LogLevelEnum.error, 'JWT validation failed: ' + String(err))
      return MqttValidationResult.error
    }
  }

  private static config: Iconfiguration
  private static secret: string
  private static specificationsChanged = new Subject<string>()
  private static newConfig: Iconfiguration = {
    version: CONFIG_VERSION,
    mqttbasetopic: 'modbus2mqtt',
    mqttdiscoveryprefix: 'homeassistant',
    mqttdiscoverylanguage: 'en',
    mqttconnect: {
      connectTimeout: DEFAULT_MQTT_CONNECT_TIMEOUT,
    },
    httpport: 3000,
    fakeModbus: false,
    noAuthentication: false,
  }

  private static ensurePersistence(): ConfigPersistence {
    if (!Config.persistence) {
      Config.persistence = new ConfigPersistence()
    }
    return Config.persistence
  }

  static getConfiguration(): Iconfiguration {
    if (Config.secret == undefined) {
      Config.secret = Config.ensurePersistence().ensureSecret()
    }

    if (Config.config) {
      Config.config.version = Config.config.version ? Config.config.version : CONFIG_VERSION
      Config.config.mqttbasetopic = Config.config.mqttbasetopic ? Config.config.mqttbasetopic : 'modbus2mqtt'
      Config.config.mqttdiscoveryprefix = Config.config.mqttdiscoveryprefix ? Config.config.mqttdiscoveryprefix : 'homeassistant'
      Config.config.mqttdiscoverylanguage = Config.config.mqttdiscoverylanguage ? Config.config.mqttdiscoverylanguage : 'en'
      if (!Config.config.mqttconnect) Config.config.mqttconnect = {}
      Config.updateMqttTlsConfig(Config.config)

      Config.config.mqttconnect.connectTimeout = Config.config.mqttconnect.connectTimeout
        ? Config.config.mqttconnect.connectTimeout
        : DEFAULT_MQTT_CONNECT_TIMEOUT
      Config.config.mqttconnect.clientId = Config.config.mqttconnect.clientId ? Config.config.mqttconnect.clientId : 'modbus2mqtt'
      Config.config.mqttconnect.clean = Config.config.mqttconnect.clean ? Config.config.mqttconnect.clean : false
      delete Config.config.mqttconnect.will
      Config.config.httpport = Config.config.httpport ? Config.config.httpport : 3000
      Config.config.fakeModbus = Config.config.fakeModbus ? Config.config.fakeModbus : false
      Config.config.noAuthentication = Config.config.noAuthentication ? Config.config.noAuthentication : false
      Config.config.tcpBridgePort = Config.config.tcpBridgePort ? Config.config.tcpBridgePort : 502
      Config.config.appVersion = Config.config.appVersion ? Config.config.appVersion : packageJson.version
      Config.config.mqttusehassio =
        Config.config.mqttusehassio && process.env.HASSIO_TOKEN && process.env.HASSIO_TOKEN.length
          ? Config.config.mqttusehassio
          : process.env.HASSIO_TOKEN != undefined && process.env.HASSIO_TOKEN.length > 0
      Config.config.supervisor_host = Config.config.supervisor_host ? Config.config.supervisor_host : 'supervisor'

      // HTTPS configuration: env var takes precedence over YAML
      const envHttpsPort = process.env.MODBUS2MQTT_HTTPS_PORT
      if (envHttpsPort) {
        const parsed = parseInt(envHttpsPort, 10)
        if (!isNaN(parsed) && parsed > 0) {
          Config.config.httpsPort = parsed
        }
      }
      // Default certificate filenames when HTTPS is configured
      if (Config.config.httpsPort) {
        Config.config.httpsCertFile = Config.config.httpsCertFile ? Config.config.httpsCertFile : 'fullchain.pem'
        Config.config.httpsKeyFile = Config.config.httpsKeyFile ? Config.config.httpsKeyFile : 'privkey.pem'
      }
      // Disable HTTPS in addon mode
      if (Config.config.mqttusehassio) {
        Config.config.httpsPort = undefined
      }
    } else {
      log.log(LogLevelEnum.info, 'No config file found ')
      Config.config = structuredClone(Config.newConfig)
    }
    return structuredClone(Config.config)
  }
  static getAuthStatus(): IUserAuthenticationStatus {
    return {
      registered:
        Config.config.mqttusehassio ||
        Config.config.noAuthentication ||
        (Config.config.username != undefined && Config.config.password != undefined),
      hassiotoken: Config.config.mqttusehassio ? Config.config.mqttusehassio : false,
      noAuthentication: Config.config.noAuthentication ? Config.config.noAuthentication : false,
      mqttConfigured: false,
      preSelectedBusId: Bus.getBusses().length == 1 ? Bus.getBusses()[0].getId() : undefined,
    }
  }

  static executeHassioGetRequest<T>(url: string, next: (_dev: T) => void, reject: (error: Error) => void): void {
    const hassiotoken: string | undefined = process.env.HASSIO_TOKEN
    if (!hassiotoken || hassiotoken.length == 0) throw new Error('ENV: HASSIO_TOKEN not defined')

    const timer = setTimeout(() => {
      clearTimeout(timer)
      reject(new Error('TIMEOUT(' + HASSIO_TIMEOUT + 'ms)'))
    }, HASSIO_TIMEOUT /* ms */)
    try {
      fetch('http://' + Config.getConfiguration().supervisor_host + url, {
        headers: {
          authorization: 'Bearer ' + hassiotoken,
          accept: 'application/json',
        },
      })
        .then((res) => {
          clearTimeout(timer)
          if (res)
            res
              .json()
              .then((obj: unknown) => {
                const o = obj as { data?: unknown; result?: string; message?: string }
                if (o && o.data !== undefined) next(obj as T)
                else if (o && o.result === 'error') reject(new Error('HASSIO: ' + (o.message ?? '')))
                else reject(new Error('get' + url + ' expected data root object: ' + JSON.stringify(obj)))
              })
              .catch((reason) => {
                const msg = 'supervisor call ' + url + ' failed ' + JSON.stringify(reason) + ' ' + res.headers.get('content-type')
                log.log(LogLevelEnum.error, msg)
                reject(new Error(msg))
              })
        })
        .catch((reason) => {
          clearTimeout(timer)
          log.log(LogLevelEnum.error, JSON.stringify(reason))
          reject(reason instanceof Error ? reason : new Error(String(reason)))
        })
    } catch (e: unknown) {
      if (e instanceof Error) log.log(LogLevelEnum.error, e.message)
    }
  }

  validateHassioToken(hassiotoken: string, next: () => void, reject: () => void): void {
    if (!hassiotoken || hassiotoken.length == 0) throw new Error('ENV: HASSIO_TOKEN not defined')

    fetch('http://supervisor/hardware/info', {
      headers: {
        authorization: 'Bearer ' + hassiotoken,
        accept: 'application/json',
      },
    })
      .then((res) => {
        if (res.status! >= 200 && res.status! < 300) next()
        else {
          res.json().then((e) => {
            log.log(LogLevelEnum.error, 'Hassio validation error: ' + JSON.stringify(e))
            reject()
          })
        }
      })
      .catch((e) => {
        log.log(LogLevelEnum.error, e.message)
      })
  }
  static updateMqttTlsConfig(config: Iconfiguration) {
    if (config && config.mqttconnect) {
      const persistence = Config.ensurePersistence()
      ;(config.mqttconnect as IClientOptions).key = persistence.readCertificateFile(config.mqttkeyFile)
      ;(config.mqttconnect as IClientOptions).ca = persistence.readCertificateFile(config.mqttcaFile)
      ;(config.mqttconnect as IClientOptions).cert = persistence.readCertificateFile(config.mqttcertFile)
    }
  }

  private async getMqttLoginFromHassio(): Promise<ImqttClient> {
    return new Promise<ImqttClient>((resolve, reject) => {
      try {
        Config.executeHassioGetRequest<{ data: ImqttClient }>(
          '/services/mqtt',
          (mqtt) => {
            const config = Config.getConfiguration()
            config.mqttconnect = mqtt.data
            if (
              config.mqttconnect.mqttserverurl == undefined &&
              (config.mqttconnect as IClientOptions).host != undefined &&
              (config.mqttconnect as IClientOptions).port != undefined
            )
              config.mqttconnect.mqttserverurl =
                (config.mqttconnect.ssl ? 'mqtts' : 'mqtt') +
                '://' +
                (config.mqttconnect as IClientOptions).host +
                ':' +
                (config.mqttconnect as IClientOptions).port
            if (mqtt.data.ssl) Config.updateMqttTlsConfig(config)
            delete config.mqttconnect.ssl
            delete config.mqttconnect.protocol

            delete (config.mqttconnect as Record<string, unknown>)['addon']
            debugAddon('getMqttLoginFromHassio: Read MQTT login data from Hassio')
            config.mqttconnect.connectTimeout = DEFAULT_MQTT_CONNECT_TIMEOUT
            resolve(config.mqttconnect)
          },
          reject
        )
      } catch (e: unknown) {
        if (e instanceof Error) debugAddon('getMqttLoginFromHassio: failed to read MQTT login data from Hassio ' + e.message)
        reject(e)
      }
    })
  }

  async getMqttConnectOptions(): Promise<ImqttClient> {
    const config = Config.getConfiguration()

    if (config.mqttusehassio) {
      return await this.getMqttLoginFromHassio()
    }

    // Manual MQTT configuration
    Config.updateMqttTlsConfig(config)

    if (!Config.config.mqttconnect.mqttserverurl) {
      throw new Error('Configuration problem: no mqttserverurl defined')
    }
    if (!Config.config.mqttconnect.username) {
      throw new Error('Configuration problem: no mqttuser defined')
    }
    if (!Config.config.mqttconnect.password) {
      throw new Error('Configuration problem: no mqttpassword defined')
    }

    return Config.config.mqttconnect
  }
  static isMqttConfigured(mqttClient: ImqttClient): boolean {
    return mqttClient != undefined && mqttClient.mqttserverurl != undefined
  }
  async readYamlAsync(): Promise<void> {
    try {
      if (!ConfigPersistence.configDir || ConfigPersistence.configDir.length == 0) {
        log.log(LogLevelEnum.error, 'configDir not defined in command line')
      }

      const persistence = Config.ensurePersistence()
      const configData = await persistence.read()

      if (configData) {
        Config.config = configData
        if (Config.config.debugComponents && Config.config.debugComponents.length) Debug.enable(Config.config.debugComponents)
        if (ConfigPersistence.configDir.length == 0) log.log(LogLevelEnum.error, 'configDir not set')
      } else {
        log.log(LogLevelEnum.info, 'configuration file not found ' + persistence.getConfigPath())
        Config.config = structuredClone(Config.newConfig)
      }

      if (!Config.config || !Config.config.mqttconnect || !Config.isMqttConfigured(Config.config.mqttconnect)) {
        try {
          const mqttLoginData = await this.getMqttConnectOptions()
          Config.mqttHassioLoginData = mqttLoginData
        } catch (reason) {
          log.log(LogLevelEnum.error, 'Unable to connect to mqtt ' + reason)
          Config.config.mqttusehassio = false
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) log.log(LogLevelEnum.error, 'readyaml failed: ' + error.message)
      throw error
    }
  }
  // set the base file for relative includes
  readYaml(): void {
    this.readYamlAsync
      .bind(this)()
      .then(() => {})
      .catch((reason) => {
        log.log(LogLevelEnum.error, 'readYaml failed ' + reason)
      })
  }

  writeConfiguration(config: Iconfiguration) {
    Config.config = config
    if (config.debugComponents && config.debugComponents.length) Debug.enable(config.debugComponents)
    Config.ensurePersistence().write(config)
  }

  static getConfigPath() {
    return Config.ensurePersistence().getConfigPath()
  }
  getSecretsPath() {
    return Config.ensurePersistence().getSecretsPath()
  }

  static resetForE2E(): void {
    // Preserve server-identity properties
    const httpport = Config.config?.httpport
    const httpsPort = Config.config?.httpsPort
    const supervisor_host = Config.config?.supervisor_host
    const mqttusehassio = Config.config?.mqttusehassio
    const fakeModbus = Config.config?.fakeModbus

    // Reset to fresh config
    Config.config = structuredClone(Config.newConfig)
    Config.secret = undefined as unknown as string
    // Reset persistence so it picks up new dirs
    Config.persistence = undefined as unknown as ConfigPersistence

    // Restore preserved properties
    if (httpport) Config.config.httpport = httpport
    if (httpsPort) Config.config.httpsPort = httpsPort
    if (supervisor_host) Config.config.supervisor_host = supervisor_host
    if (mqttusehassio) Config.config.mqttusehassio = mqttusehassio
    if (fakeModbus) Config.config.fakeModbus = fakeModbus

    // Rewrite minimal YAML via persistence
    const minimalConfig: Record<string, unknown> = { httpport: Config.config.httpport }
    if (supervisor_host) minimalConfig.supervisor_host = supervisor_host
    Config.ensurePersistence().resetForE2E(minimalConfig)
  }
  static setFakeModbus(newMode: boolean) {
    Config.config.fakeModbus = newMode
  }
  static getFileNameFromSlaveId(slaveid: number): string {
    return 's' + slaveid
  }
  static async createZipFromLocal(_filename: string, r: import('stream').Writable): Promise<void> {
    return Config.ensurePersistence().createLocalExportZip(r)
  }
}
export function getSpecificationImageOrDocumentUrl(rootUrl: string | undefined, specName: string, url: string): string {
  const fn = getBaseFilename(url)
  let rc: string = ''
  if (rootUrl) {
    const append = rootUrl.endsWith('/') ? '' : '/'
    rc = rootUrl + append + join(filesUrlPrefix, specName, fn)
  } else rc = '/' + join(filesUrlPrefix, specName, fn)

  return rc
}
