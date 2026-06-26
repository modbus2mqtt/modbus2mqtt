import { Ientity, IidentEntity, ImodbusEntity, ImodbusSpecification, Ispecification } from '../specification/index.js'
import { IhttpPush, Islave, PollModes } from './types.js'
export interface IEntityCommandTopics {
  entityId: number
  commandTopic: string
  modbusCommandTopic?: string
}
// A single segment of a structured mqttname: either an object key or an array index.
export interface IPathToken {
  key?: string
  index?: number
}
// Matches one path token at a time: an identifier (optionally preceded by '.') or a numeric [index].
const PATH_TOKEN_RE = /\.?([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g
// A name is "structured" (encodes nested objects/arrays) as soon as it contains '.' or '['.
const STRUCTURED_MQTTNAME_RE = /[.[]/
// Guard against pathological array allocation from a huge index.
const MAX_ARRAY_INDEX = 1023
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
  // True once the mqttname encodes a nested path (contains '.' or '[').
  static isStructuredMqttName(mqttname: string): boolean {
    return STRUCTURED_MQTTNAME_RE.test(mqttname)
  }
  // Tokenizes an mqttname into a path. A flat name (or any name that does not fully
  // tokenize into a valid path, e.g. "meters[].x") yields a single key token, so it is
  // treated exactly as a flat top-level key — fully backward compatible.
  static parseMqttPath(mqttname: string): IPathToken[] {
    if (!Slave.isStructuredMqttName(mqttname)) return [{ key: mqttname }]
    const tokens: IPathToken[] = []
    let expectedIndex = 0
    PATH_TOKEN_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = PATH_TOKEN_RE.exec(mqttname)) !== null) {
      // A gap between matches means the name is malformed -> treat as a flat key.
      if (m.index !== expectedIndex) return [{ key: mqttname }]
      if (m[1] !== undefined) tokens.push({ key: m[1] })
      else tokens.push({ index: Number(m[2]) })
      expectedIndex = PATH_TOKEN_RE.lastIndex
    }
    if (expectedIndex !== mqttname.length || tokens.length === 0) return [{ key: mqttname }]
    return tokens
  }
  // Sanitizes an mqttname into a Home Assistant object_id/unique_id slug:
  // '[', ']' and '.' become '_', and leading '_' are stripped (e.g. "meters[0].obis" -> "meters_0_obis").
  static mqttNameToObjectId(mqttname: string): string {
    return mqttname.replace(/[[\].]+/g, '_').replace(/^_+/, '')
  }
  // Reads the value at the location described by tokens; returns undefined if any segment is missing.
  static getByPath(root: unknown, tokens: IPathToken[]): unknown {
    let current: unknown = root
    for (const tok of tokens) {
      if (current == undefined || typeof current !== 'object') return undefined
      const key = (tok.key != undefined ? tok.key : tok.index) as string | number
      current = (current as Record<string | number, unknown>)[key]
    }
    return current
  }
  // Replaces {{ path }} placeholders in template with values from context (path is in mqttname format).
  // Returns null as soon as a placeholder cannot be resolved, so the caller can skip the action.
  static substituteTemplate(template: string, context: unknown): string | null {
    let ok = true
    const out = template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, path: string) => {
      const v = Slave.getByPath(context, Slave.parseMqttPath(path))
      if (v == undefined) {
        ok = false
        return ''
      }
      return encodeURIComponent(String(v))
    })
    return ok ? out : null
  }
  // Assigns value into the (possibly nested) location described by tokens. The root container
  // is held in rootHolder.value so its type (array for a leading index, object otherwise) can be
  // initialized. Type conflicts (e.g. mixing a root array with root object keys) are skipped with a
  // warning so building a payload never throws.
  private static setByPath(rootHolder: { value: unknown }, tokens: IPathToken[], value: unknown): void {
    if (tokens.length === 0) return
    const first = tokens[0]
    const rootIsArray = first.index !== undefined
    if (rootHolder.value == undefined) rootHolder.value = rootIsArray ? [] : {}
    if (Array.isArray(rootHolder.value) !== rootIsArray) {
      console.warn(`Slave.setByPath: ignoring "${Slave.tokensToString(tokens)}" - conflicting root type (array vs object)`)
      return
    }
    let current = rootHolder.value as Record<string | number, unknown>
    for (let i = 0; i < tokens.length - 1; i++) {
      const tok = tokens[i]
      const next = tokens[i + 1]
      if (tok.index != undefined && tok.index > MAX_ARRAY_INDEX) {
        console.warn(`Slave.setByPath: ignoring "${Slave.tokensToString(tokens)}" - array index exceeds ${MAX_ARRAY_INDEX}`)
        return
      }
      const key = (tok.key != undefined ? tok.key : tok.index) as string | number
      const childIsArray = next.index !== undefined
      let child = current[key]
      if (child == undefined) {
        child = childIsArray ? [] : {}
        current[key] = child
      } else if (Array.isArray(child) !== childIsArray) {
        console.warn(`Slave.setByPath: ignoring "${Slave.tokensToString(tokens)}" - conflicting container type`)
        return
      }
      current = child as Record<string | number, unknown>
    }
    const last = tokens[tokens.length - 1]
    if (last.index != undefined && last.index > MAX_ARRAY_INDEX) {
      console.warn(`Slave.setByPath: ignoring "${Slave.tokensToString(tokens)}" - array index exceeds ${MAX_ARRAY_INDEX}`)
      return
    }
    current[(last.key != undefined ? last.key : last.index) as string | number] = value
  }
  private static tokensToString(tokens: IPathToken[]): string {
    return tokens.map((t) => (t.key != undefined ? t.key : '[' + t.index + ']')).join('.')
  }
  getStatePayload(entities: ImodbusEntity[], defaultValue: string | null = null): string {
    const holder: { value: unknown } = { value: undefined }
    // modbusValues stays a FLAT map keyed by the full mqttname; it is consumed by the backend
    // command path, not by Home Assistant, so there is no value in nesting it.
    const modbusValues: Record<string, number> = {}
    for (const e of entities) {
      if (e.mqttname != undefined && e.mqttname.length > 0 && e.variableConfiguration == undefined) {
        Slave.setByPath(holder, Slave.parseMqttPath(e.mqttname), e.mqttValue != undefined ? e.mqttValue : defaultValue)
        if (e.converter == 'select') {
          if (e.modbusValue != undefined && e.modbusValue.length > 0) modbusValues[e.mqttname] = e.modbusValue[0]
        }
      }
    }
    if (Object.keys(modbusValues).length > 0) {
      if (holder.value != undefined && !Array.isArray(holder.value)) {
        ;(holder.value as Record<string, unknown>)['modbusValues'] = modbusValues
      } else {
        // A root-array payload cannot carry a modbusValues object key.
        console.warn('Slave.getStatePayload: dropping modbusValues - payload root is an array')
      }
    }
    if (holder.value == undefined) holder.value = {}
    return JSON.stringify(holder.value, null, '\t')
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
  // Optional Unix cron expression controlling when the slave is polled (replaces pollInterval).
  getPollSchedule(): string | undefined {
    return this.slave.pollSchedule
  }
  getHttpPush(): IhttpPush | undefined {
    return this.slave.httpPush
  }
  hasHttpPush(): boolean {
    return this.slave.httpPush != undefined && this.slave.httpPush.url != undefined && this.slave.httpPush.url.length > 0
  }
  // Whether the slave's state should be published to MQTT. False in HTTP-push-only mode.
  shouldPublishMqtt(): boolean {
    return this.slave.pollMode !== PollModes.intervallHttpPushNoMqtt
  }
  // Builds the HTTP push payload containing only the selected push entities,
  // e.g. { "obis": "1-0:1.0.8", "obis_value": 234 }.
  // Builds the HTTP push payload from the selected push entities. If httpPush.root is set, only that
  // subtree is returned; returns null when the root path is not present so the caller skips the push.
  getHttpPushPayload(entities: ImodbusEntity[]): string | null {
    const pushEntities = this.slave.httpPush?.pushEntities ?? []
    const holder: { value: unknown } = { value: undefined }
    for (const e of entities) {
      if (e.mqttname != undefined && e.mqttname.length > 0 && e.variableConfiguration == undefined && pushEntities.includes(e.id)) {
        Slave.setByPath(holder, Slave.parseMqttPath(e.mqttname), e.mqttValue)
      }
    }
    if (holder.value == undefined) holder.value = {}
    const root = this.slave.httpPush?.root
    if (root != undefined && root.length > 0) {
      const sub = Slave.getByPath(holder.value, Slave.parseMqttPath(root))
      if (sub === undefined) return null
      return JSON.stringify(sub)
    }
    return JSON.stringify(holder.value)
  }
  // Resolves {{ path }} placeholders in the push URL against ALL entity values (including device
  // variables such as serialnumber). Returns null when a placeholder cannot be resolved.
  getResolvedHttpPushUrl(entities: ImodbusEntity[]): string | null {
    const url = this.slave.httpPush?.url
    if (url == undefined) return null
    if (!url.includes('{{')) return url
    const holder: { value: unknown } = { value: undefined }
    for (const e of entities) {
      if (e.mqttname != undefined && e.mqttname.length > 0) {
        Slave.setByPath(holder, Slave.parseMqttPath(e.mqttname), e.mqttValue)
      }
    }
    return Slave.substituteTemplate(url, holder.value ?? {})
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
