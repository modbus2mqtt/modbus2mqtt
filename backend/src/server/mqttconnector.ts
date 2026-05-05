import { Slave, ImqttClient } from '../shared/server/index.js'
import { IClientOptions, MqttClient, connect } from 'mqtt'
import { format } from 'util'
import { Config } from './config.js'
import { Logger, LogLevelEnum } from '../specification/index.js'
import Debug from 'debug'
// removed unused imports

const log = new Logger('mqttconnector')
const debugMqttClient = Debug('mqttclient')
const debug = Debug('mqttconnector')

export class MqttConnector {
  private client?: MqttClient
  private subscribedSlaves: Slave[] = []
  private isSubscribed: boolean
  private onMqttMessageListeners: ((topic: string, payload: Buffer) => Promise<void>)[] = []
  private onConnectListener: ((mqttClient: MqttClient) => void)[] = []
  onConnectCallbacks: ((connection: MqttClient) => void)[]
  private static instance: MqttConnector | undefined = undefined
  static getInstance(): MqttConnector {
    if (MqttConnector.instance) return MqttConnector.instance

    MqttConnector.instance = new MqttConnector()

    return MqttConnector.instance
  }

  static resetInstance(): void {
    if (MqttConnector.instance?.client) {
      MqttConnector.instance.client.removeAllListeners()
      MqttConnector.instance.client.end(true)
    }
    MqttConnector.instance = undefined
  }

  constructor() {
    this.onConnectCallbacks = []
  }
  addOnMqttMessageListener(onMqttMessage: (topic: string, payload: Buffer) => Promise<void>) {
    this.onMqttMessageListeners.push(onMqttMessage)
  }

  addOnConnectListener(listener: (mqttClient: MqttClient) => void) {
    this.onConnectListener.push(listener)
  }
  private executeActions(mqttClient: MqttClient) {
    let callback = this.onConnectCallbacks.shift()
    while (mqttClient && mqttClient.connected && callback) {
      callback(mqttClient!)
      callback = this.onConnectCallbacks.shift()
    }
  }
  private handleErrors(e: Error) {
    log.log(LogLevelEnum.error, 'MQTT error: ' + e.message)
  }
  private onConnect(mqttClient: MqttClient) {
    debug('reconnecting MQTT')
    this.onConnectListener.forEach((listener) => {
      listener.bind(this)(mqttClient)
    })
    this.executeActions(this.client!)
  }

  validateConnection(connectionData: ImqttClient | undefined, callback: (valid: boolean, message: string) => void) {
    if (connectionData && connectionData.mqttserverurl != undefined) {
      const opts: IClientOptions = {
        ...(connectionData as IClientOptions),
        reconnectPeriod: 0,
        connectTimeout: 5000,
      }
      const client = connect(connectionData.mqttserverurl, opts)
      let settled = false
      const settle = (valid: boolean, message: string) => {
        if (settled) return
        settled = true
        try {
          client.end(true)
        } catch {
          /* ignore */
        }
        callback(valid, message)
      }
      client.on('error', (e) => {
        settle(false, connectionData.mqttserverurl + ': ' + e.toString())
      })
      client.on('connect', () => {
        settle(true, 'OK')
      })
    } else callback(false, 'no mqttserverlurl passed')
  }

  isConnected(): boolean {
    return this.client != undefined && this.client.connected
  }

  getMqttClient(onConnectCallback: (connection: MqttClient) => void): void {
    this.onConnectCallbacks.push(onConnectCallback)
    this.connectMqtt(undefined)
  }
  private equalConnectionData(client: MqttClient, clientConfiguration: ImqttClient): boolean {
    return (
      client.options.protocol + '://' + client.options.host + ':' + client.options.port == clientConfiguration.mqttserverurl &&
      client.options.username == clientConfiguration.username &&
      client.options.password == clientConfiguration.password
    )
  }

  private connectMqtt(connectionData: ImqttClient | undefined): void {
    let mqttConnect = Config.getConfiguration().mqttconnect
    if (Config.getConfiguration().mqttusehassio && Config.mqttHassioLoginData) mqttConnect = Config.mqttHassioLoginData
    const conn = () => {
      if (!connectionData) connectionData = mqttConnect
      if (!connectionData) {
        this.handleErrors(new Error('No mqtt connection configured.'))
        return
      }
      if (connectionData.mqttserverurl) {
        const opts = connectionData
        // connect need IClientOptions which has some additional properties in the type
        const iopts = connectionData as IClientOptions
        iopts.log = (...args) => {
          const message = args.shift()
          debugMqttClient(format(message, args))
        }
        iopts.clean = false
        iopts.reconnectPeriod = 1000
        iopts.keepalive = 60
        iopts.clientId = Config.getConfiguration().mqttbasetopic
        if (iopts.ca == undefined) delete iopts.ca
        if (iopts.key == undefined) delete iopts.key
        if (iopts.cert == undefined) delete iopts.cert

        if (this.client) this.client.reconnect(opts as IClientOptions)
        else this.client = connect(connectionData.mqttserverurl, opts as IClientOptions)
        this.client.removeAllListeners('error')
        this.client.removeAllListeners('message')
        this.client.removeAllListeners('connect')
        this.client.removeAllListeners('connect')
        this.client.on('error', this.handleErrors.bind(this))
        this.onMqttMessageListeners.forEach((listener) => {
          this.client!.on('message', listener)
        })
        this.client.on('connect', this.onConnect.bind(this, this.client))
        this.client.on('reconnect', this.onConnect.bind(this, this.client))
      } else {
        this.handleErrors(new Error('mqtt server url is not defined'))
      }
    }

    if (this.client != undefined) {
      if (this.equalConnectionData(this.client, mqttConnect)) {
        if (!this.client.connected) conn()
        else this.executeActions(this.client)
      } else {
        // reconnect with new connection date
        this.client.end(() => {
          this.client = undefined
          conn()
        })
      }
    } else conn()
  }
}
