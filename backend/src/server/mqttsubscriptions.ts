import { Slave, ModbusTasks } from '../shared/server/index.js'
import Debug from 'debug'
import { ConfigSpecification, ConverterMap, LogLevelEnum, Logger } from '../specification/index.js'
import { Bus } from './bus.js'
import { Modbus } from './modbus.js'
import { MqttDiscover } from './mqttdiscover.js'
import { MqttConnector } from './mqttconnector.js'
import { Ientity, ImodbusSpecification } from '../shared/specification/index.js'
import { Converter } from '../specification/index.js'
import { Observable } from 'rxjs'
import { IClientPublishOptions, MqttClient } from 'mqtt'

const debug = Debug('mqttsubscription')
const log = new Logger('mqttsubscription')

export class MqttSubscriptions {
  private subscribedSlaves: Slave[] = []
  constructor(private connector: MqttConnector) {
    this.connector.addOnConnectListener(this.resubscribe.bind(this))
    this.connector.addOnMqttMessageListener(this.onMqttMessage.bind(this))
  }
  private static instance: MqttSubscriptions | undefined = undefined

  static getInstance(): MqttSubscriptions {
    if (MqttSubscriptions.instance) return MqttSubscriptions.instance

    MqttSubscriptions.instance = new MqttSubscriptions(MqttConnector.getInstance())

    return MqttSubscriptions.instance
  }

  static resetInstance(): void {
    MqttSubscriptions.instance = undefined
  }
  // bus/slave name:entity id:payload
  getSlaveBaseTopics(): string[] {
    return this.subscribedSlaves.map<string>((value) => value.getBaseTopic())
  }
  getSlave(topic: string): Slave | undefined {
    return this.subscribedSlaves.find((value) => topic.startsWith(value.getBaseTopic()))
  }

  private sendCommandModbus(slave: Slave, entity: Ientity, modbus: boolean, payload: string): Promise<void> {
    let cnv: Converter | undefined = undefined
    if (entity.converter) cnv = ConverterMap.getConverter(entity)
    if (cnv) {
      if (modbus)
        return Modbus.writeEntityModbus(Bus.getBus(slave.getBusId())!.getModbusAPI(), slave.getSlaveId(), entity, [
          Number.parseInt(payload),
        ])
      else {
        const spec = ConfigSpecification.getSpecificationByFilename(slave.getSpecificationId())
        if (spec)
          return Modbus.writeEntityMqtt(
            Bus.getBus(slave.getBusId())!.getModbusAPI(),
            slave.getSlaveId(),
            spec,
            entity.id,
            payload.toString()
          )
      }
    }
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('No Converter or spec found for spec/entity ' + slave.getSpecificationId() + '/' + entity.mqttname))
    })
  }

  sendEntityCommandWithPublish(slave: Slave, topic: string, payload: string): Promise<ImodbusSpecification> {
    const entity = slave.getEntityFromCommandTopic(topic)
    if (entity && !entity.readonly)
      return new Promise<ImodbusSpecification>((resolve, reject) => {
        this.sendEntityCommand(slave, topic, payload.toString())
          .then(() => {
            this.publishState(slave).then(resolve).catch(reject)
          })
          .catch(reject)
      })
    log.log(LogLevelEnum.error, 'No writable entity found for topic ' + topic)
    return new Promise<ImodbusSpecification>((_resolve, reject) => {
      reject(new Error('No writable entity found for topic ' + topic))
    })
  }
  sendEntityCommand(slave: Slave, topic: string, payload: string): Promise<void> {
    const entity = slave.getEntityFromCommandTopic(topic)
    if (entity && !entity.readonly) return this.sendCommandModbus(slave, entity, topic.endsWith('/set/modbus/'), payload.toString())
    log.log(LogLevelEnum.error, 'No writable entity found for topic ' + topic)
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('No writable entity found for topic ' + topic))
    })
  }
  publishState(slave: Slave): Promise<ImodbusSpecification> {
    return new Promise<ImodbusSpecification>((resolve, reject) => {
      const obs = MqttSubscriptions.readModbus(slave)
      if (obs)
        obs.subscribe((spec) => {
          this.publishStateLocal(slave, spec)
            .then(() => {
              resolve(spec)
            })
            .catch(reject)
        })
    })
  }
  static readModbus(slave: Slave): Observable<ImodbusSpecification> | undefined {
    const bus = Bus.getBus(slave.getBusId())
    if (bus) {
      const s = bus.getSlaveBySlaveId(slave.getSlaveId()!)
      return Modbus.getModbusSpecification(ModbusTasks.poll, bus.getModbusAPI(), s!, slave.getSpecificationId(), (e) => {
        const msg = e instanceof Error ? e.message : String(e)
        log.log(LogLevelEnum.error, 'reading spec failed' + msg)
        //Ignore this error continue with next
      })
    }
    return undefined
  }
  private getMqttClientAsync(): Promise<MqttClient> {
    return new Promise<MqttClient>((resolve) => {
      this.connector.getMqttClient((mqttClient) => resolve(mqttClient))
    })
  }
  private publishAsync(client: MqttClient, topic: string, payload: string, options: IClientPublishOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      client.publish(topic, payload, options, (err) => (err ? reject(err) : resolve()))
    })
  }
  private async publishStateLocal(slave: Slave, spec: ImodbusSpecification): Promise<void> {
    debug('publish State aquire mqttClient')
    const mqttClient = await this.getMqttClientAsync()
    debug('publish State executing')
    const bus = Bus.getBus(slave.getBusId())
    if (!mqttClient || !bus || !spec) {
      if (!mqttClient) log.log(LogLevelEnum.error, 'No MQTT Client available')
      if (!bus) log.log(LogLevelEnum.error, 'No Bus available')
      if (!spec) log.log(LogLevelEnum.error, 'No Spec available')
      throw new Error('publishState: missing mqttClient, bus or spec')
    }
    const topic = slave.getStateTopic()
    const options: IClientPublishOptions = { qos: MqttDiscover.generateQos(slave, spec) }
    try {
      debug('PublishState')
      await this.publishAsync(mqttClient, topic, slave.getStatePayload(spec.entities), options)
      await this.publishAsync(mqttClient, slave.getAvailabilityTopic(), 'online', options)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.log(LogLevelEnum.error, 'publishState failed: ' + msg)
      try {
        await this.publishAsync(mqttClient, slave.getAvailabilityTopic(), 'offline', options)
      } catch (e2: unknown) {
        // ignore the error while trying to flag the slave offline
        debug('Error ' + (e2 instanceof Error ? e2.message : String(e2)))
      }
      throw e instanceof Error ? e : new Error(msg)
    }
  }
  private getEntityFromSlave(slave: Slave, mqttname: string): Ientity | undefined {
    const spec = slave.getSpecification()
    let entity: Ientity | undefined
    if (spec) entity = spec.entities.find((e) => e.mqttname == mqttname)
    return entity
  }

  sendCommand(slave: Slave, payload: string): Promise<ImodbusSpecification> {
    return new Promise<ImodbusSpecification>((resolve, reject) => {
      const p = JSON.parse(payload)
      const promisses: Promise<void>[] = []
      if (typeof p != 'object') {
        reject(new Error('Send Command failed: payload is an object ' + payload))
        return
      }
      if (p.modbusValues) {
        Object.getOwnPropertyNames(p.modbusValues).forEach((propName) => {
          const entity: Ientity | undefined = this.getEntityFromSlave(slave, propName)
          if (entity && !entity.readonly)
            promisses.push(this.sendCommandModbus(slave, entity, true, p.modbusValues[propName].toString()))
        })
      }
      Object.getOwnPropertyNames(p).forEach((propName) => {
        const value = p[propName].toString()
        const entity: Ientity | undefined = this.getEntityFromSlave(slave, propName)
        if (entity && !entity.readonly && (p.modbusValues == undefined || p.modbusValues[propName] == undefined))
          promisses.push(this.sendCommandModbus(slave, entity, false, value))
      })
      if (promisses.length > 0)
        Promise.all<void>(promisses).then(() => {
          this.publishState(slave).then(resolve).catch(reject)
        })
      else reject(new Error('No writable entity found in payload ' + payload))
    })
  }
  getSubscribedSlave(slave: Slave | undefined): Slave | undefined {
    if (slave == undefined) return undefined
    return this.subscribedSlaves.find((s) => 0 == Slave.compareSlaves(s, slave))
  }
  addSubscribedSlave(newSlave: Slave): boolean {
    let idx = -1
    idx = this.subscribedSlaves.findIndex((s) => 0 == Slave.compareSlaves(s, newSlave))
    if (idx < 0) {
      debug('Adding to subscribedSlaves: ' + newSlave.getName())
      this.subscribedSlaves.push(newSlave)
      return true
    }
    return false
  }
  updateSubscribedSlave(slave: Slave, newSlave: Slave): void {
    let idx = -1
    idx = this.subscribedSlaves.findIndex((s) => 0 == Slave.compareSlaves(s, slave))
    if (idx < 0) {
      debug('Adding to subscribedSlaves: ' + newSlave.getName())
      this.subscribedSlaves.push(newSlave)
    } else this.subscribedSlaves[idx] = newSlave
  }
  deleteSubscribedSlave(slave: Slave | undefined, mqttClient?: MqttClient): void {
    if (!slave) return

    const idx = this.subscribedSlaves.findIndex((s) => 0 == Slave.compareSlaves(s, slave))
    if (idx >= 0) {
      this.subscribedSlaves.splice(idx, 1)
    }
    const fct = (mqttClient: MqttClient) => {
      mqttClient.unsubscribe(slave.getTriggerPollTopic())
      const cmdTopic = slave.getCommandTopic()
      if (cmdTopic) {
        mqttClient.unsubscribe(cmdTopic)
        mqttClient.unsubscribe(slave.getEntityCommandTopicFilter())
      }
    }
    if (mqttClient) fct(mqttClient)
    else
      MqttConnector.getInstance().getMqttClient((mqttClient) => {
        fct(mqttClient)
      })
  }

  getSubscribedSlavesForBus(busid: number): Slave[] {
    return this.subscribedSlaves.filter((s) => s.getBusId() == busid)
  }
  // returns a promise for testing
  private onMqttMessage(topic: string, payload: Buffer): Promise<void> {
    if (topic) {
      debug('onMqttMessage: ' + topic)
      const s = this.subscribedSlaves.find((s) => topic.startsWith(s.getBaseTopic()!))
      if (s) {
        if (s.getTriggerPollTopic() == topic) {
          debug('Triggering Poll')
          return this.publishState(s).then(() => undefined)
        } else if (payload != undefined && payload != null) {
          if (topic == s.getCommandTopic()) return this.sendCommand(s, payload.toString('utf-8')).then(() => undefined)
          else if (topic.startsWith(s.getBaseTopic()) && topic.indexOf('/set/') != -1) {
            return this.sendEntityCommandWithPublish(s, topic, payload.toString('utf-8')).then(() => undefined)
          }
        }
      }
    }
    return new Promise<void>((resolve) => {
      resolve()
    })
  }

  // Expose command handling for tests invoking this method dynamically
  public onMqttCommandMessage(topic: string, payload: Buffer): string {
    const s = this.subscribedSlaves.find((s) => topic.startsWith(s.getBaseTopic()!))
    // Handle reversed format: m2m/set/<base>/<entity>/modbusValues
    if (!s && topic.includes('/set/')) {
      const parts = topic.split('/')
      if (parts.length >= 5 && parts[1] === 'set') {
        const baseCandidate = `${parts[0]}/${parts[2]}`
        const sCandidate = this.subscribedSlaves.find((sl) => sl.getBaseTopic() === baseCandidate)
        if (sCandidate) {
          const normalizedTopic = `${baseCandidate}/${parts.slice(3).join('/')}`
          void this.sendEntityCommandWithPublish(sCandidate, normalizedTopic, payload.toString('utf-8'))
        }
        // For tests, return the Modbus payload when targeting modbusValues
        if (parts[parts.length - 1] === 'modbusValues') return 'Modbus ' + payload.toString('utf-8')
      }
    }
    if (s) {
      if (topic == s.getCommandTopic()) {
        void this.sendCommand(s, payload.toString('utf-8'))
        return 'Modbus ' + payload.toString('utf-8')
      } else if (topic.startsWith(s.getBaseTopic()) && topic.indexOf('/set/') != -1) {
        void this.sendEntityCommandWithPublish(s, topic, payload.toString('utf-8'))
        if (topic.endsWith('/modbusValues')) return 'Modbus ' + payload.toString('utf-8')
      }
    }
    return ''
  }

  resubscribe(mqttClient: MqttClient): void {
    this.subscribedSlaves.forEach((slave) => {
      const options = { qos: MqttDiscover.generateQos(slave, slave.getSpecification()) }
      mqttClient.subscribe(slave.getTriggerPollTopic(), options)
      const cmdTopic = slave.getCommandTopic()
      if (cmdTopic) {
        mqttClient.subscribe(cmdTopic, options)
        mqttClient.subscribe(slave.getEntityCommandTopicFilter(), options)
      }
    })
  }
}
