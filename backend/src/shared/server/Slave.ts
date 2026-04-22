import { Ientity, IidentEntity, ImodbusEntity, ImodbusSpecification, Ispecification } from '../specification/index.js'
import { Islave, PollModes } from './types.js'
export interface IEntityCommandTopics {
  entityId: number
  commandTopic: string
  modbusCommandTopic?: string
}
export class Slave {
  constructor(
    private busid: number,
    private slave: Islave,
    private mqttBaseTopic: string
  ) {}
  getStateTopic(): string {
    return this.getBaseTopic() + '/state/'
  }
  hasRootTopic(): boolean {
    return this.slave.rootTopic != undefined
  }
  getBaseTopic(): string {
    if (this.hasRootTopic()) return this.mqttBaseTopic + '/' + this.slave.rootTopic!
    else return this.mqttBaseTopic + '/' + this.busid + 's' + this.slave.slaveid
  }

  getTriggerPollTopic(): string {
    return this.getBaseTopic() + '/triggerPoll/'
  }
  getEntityCommandTopic(entity?: IidentEntity): IEntityCommandTopics | undefined {
    let commandTopic: string | undefined = undefined
    const modbusCommandTopic: string | undefined = undefined
    if (entity)
      if (!entity.readonly) {
        commandTopic = this.getBaseTopic() + '/' + entity.mqttname + '/set/'
        // TODO user /set/ for select if (entity.converter == ) modbusCommandTopic = this.getBaseTopic() + '/' + entity.mqttname + '/set/'
        return {
          entityId: entity.id,
          commandTopic: commandTopic ? commandTopic : 'error',
          modbusCommandTopic: modbusCommandTopic ? modbusCommandTopic : undefined,
        }
      }
    return undefined
  }

  getEntityCommandTopicFilter(): string {
    return this.getBaseTopic() + '/+/set/#'
  }
  getNoDiscoverEntities(): number[] {
    return this.slave.noDiscoverEntities ? this.slave.noDiscoverEntities : []
  }
  getNoDiscovery(): boolean {
    return this.slave.noDiscovery == undefined ? false : this.slave.noDiscovery
  }

  getCommandTopic(): string | undefined {
    let commandTopic: string | undefined = undefined
    if (this.slave.specification?.entities.find((e) => !e.readonly)) {
      commandTopic = this.getBaseTopic() + '/set/'
      return commandTopic
    }
    return undefined
  }
  getEntityFromCommandTopic(topic: string): Ientity | undefined {
    const start = this.getBaseTopic()!.length
    const idx = topic.indexOf('/', start + 1)

    const mqttname = topic.substring(start + 1, idx >= 0 ? idx : undefined)
    const path = mqttname.split('/')
    if (path.length > 0) {
      if (this.slave.specification && (this.slave.specification as ImodbusSpecification).entities) {
        return (this.slave.specification as ImodbusSpecification).entities.find((e) => e.mqttname == path[0])
      }
    }
    return undefined
  }
  getAvailabilityTopic() {
    return this.getBaseTopic() + '/availability/'
  }
  getStatePayload(entities: ImodbusEntity[], defaultValue: string | null = null): string {
    type StatePayload = { [key: string]: unknown; modbusValues?: Record<string, number> }
    const o: StatePayload = {}
    for (const e of entities) {
      if (e.mqttname != undefined && e.mqttname.length > 0 && e.variableConfiguration == undefined) {
        o[e.mqttname] = e.mqttValue != undefined ? e.mqttValue : defaultValue
        if (e.converter == 'select') {
          if (o.modbusValues == undefined) o.modbusValues = {}
          if (e.modbusValue != undefined && e.modbusValue.length > 0) o.modbusValues[e.mqttname] = e.modbusValue[0]
        }
      }
    }
    return JSON.stringify(o, null, '\t')
  }
  getBusId(): number {
    return this.busid
  }
  getSlaveId(): number {
    return this.slave.slaveid
  }
  getEntityName(entityId: number): string | undefined {
    const spec = this.getSpecification()
    if (!spec || !spec.entities) return undefined
    const e = spec.entities.find((e) => e.id == entityId)
    return e ? e.name : undefined
  }
  getName(): string | undefined {
    return this.slave.name
  }
  getConfigurationUrl(): string | undefined {
    return this.slave.configurationUrl
  }
  getQos(): number | undefined {
    return this.slave.qos
  }
  getPollMode(): PollModes | undefined {
    return this.slave.pollMode
  }
  static compareSlaves(s1: Slave, s2: Slave): number {
    let rc = s1.busid - s2.busid
    if (!rc) {
      rc = s1.slave.slaveid - s2.slave.slaveid
    }
    return rc
  }
  getKey(): string {
    return this.busid + 's' + this.slave.slaveid
  }

  getSpecification(): Ispecification | undefined {
    if (this.slave && this.slave.specification) return this.slave.specification
    return undefined
  }

  getSpecificationId(): string | undefined {
    if (this.slave && this.slave.specificationid) return this.slave.specificationid
    return undefined
  }
  clone(): Slave {
    return new Slave(this.busid, structuredClone(this.slave), this.mqttBaseTopic)
  }
}
