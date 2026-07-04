import * as fs from 'fs'
import { Config } from '../config.js'
import { ConfigBus } from '../configbus.js'
import { ConfigPersistence } from '../persistence/configPersistence.js'
import { Bus } from '../bus.js'
import { MqttConnector } from '../mqttconnector.js'
import { MqttDiscover } from '../mqttdiscover.js'
import { MqttSubscriptions } from '../mqttsubscriptions.js'
import { ConfigSpecification, LogLevelEnum, Logger } from '../../specification/index.js'

const log = new Logger('httpserver')

/**
 * Connect a temporary MQTT client, collect all retained messages, then
 * clear them by publishing empty payloads with retain=true.
 */
async function clearRetainedMqttMessages(): Promise<void> {
  const mqttConnect = Config.getConfiguration().mqttconnect
  let mqttUrl = mqttConnect?.mqttserverurl
  if (!mqttUrl && Config.mqttHassioLoginData?.mqttserverurl) {
    mqttUrl = Config.mqttHassioLoginData.mqttserverurl
  }
  if (!mqttUrl) return // no MQTT configured – nothing to clear

  const opts = Config.mqttHassioLoginData ?? mqttConnect
  const { connect } = await import('mqtt')
  return new Promise<void>((resolve) => {
    const retainedTopics: string[] = []
    const client = connect(mqttUrl, {
      username: opts.username,
      password: opts.password as string | undefined,
      clean: true,
      clientId: 'e2e-reset-' + Date.now(),
      connectTimeout: 5000,
    })
    const timer = setTimeout(() => {
      // After collecting retained messages, clear them
      for (const topic of retainedTopics) {
        client.publish(topic, '', { retain: true })
      }
      client.end(false, () => resolve())
    }, 1000)

    client.on('error', () => {
      clearTimeout(timer)
      client.end(true)
      resolve() // don't block reset if MQTT is unreachable
    })
    client.on('connect', () => {
      client.subscribe('#', { qos: 0 })
    })
    client.on('message', (topic, _payload, packet) => {
      if (packet.retain) {
        retainedTopics.push(topic)
      }
    })
  })
}

/** Full state reset for E2E test runs (guarded by the MODBUS2MQTT_E2E env var). */
export async function resetForE2E(): Promise<void> {
  log.log(LogLevelEnum.info, 'E2E reset: starting')

  // Phase 0: Clear retained MQTT messages before disconnecting
  await clearRetainedMqttMessages()

  // Phase 1: Stop active processes
  Bus.resetForE2E()
  MqttDiscover.resetInstance()
  MqttSubscriptions.resetInstance()
  MqttConnector.resetInstance()

  // Phase 2: Clear config state
  ConfigBus.resetForE2E()
  ConfigSpecification.resetForE2E()

  // Phase 3: Clean filesystem
  const localDir = ConfigPersistence.getLocalDir()
  const bussesDir = localDir + '/busses'
  const specsDir = localDir + '/specifications'
  if (fs.existsSync(bussesDir)) fs.rmSync(bussesDir, { recursive: true })
  if (fs.existsSync(specsDir)) fs.rmSync(specsDir, { recursive: true })

  // Phase 4: Reset config (preserves httpport/supervisor_host, rewrites minimal YAML)
  Config.resetForE2E()

  // Phase 5: Re-initialize from (now clean) disk
  await new Config().readYamlAsync()
  new ConfigSpecification().readYaml()
  ConfigBus.readBusses()

  // Phase 6: Re-create MqttDiscover singleton to re-register ConfigBus listeners
  // (addSlave, deleteSlave, updateSlave, deleteBus events for MQTT discovery)
  MqttDiscover.getInstance()

  log.log(LogLevelEnum.info, 'E2E reset: complete')
}
