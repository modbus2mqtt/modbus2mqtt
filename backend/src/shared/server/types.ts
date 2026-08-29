import { IdentifiedStates, IidentEntity, Ispecification, ModbusRegisterType, SpecificationStatus } from '../specification/index.js'

export enum HttpErrorsEnum {
  OK = 200,
  OkCreated = 201,
  OkAccepted = 202,
  OkNonAuthoritativeInformation = 203,
  OkNoContent = 204,
  ErrBadRequest = 400,
  ErrUnauthorized = 401,
  ErrForbidden = 403,
  ErrNotFound = 404,
  ErrNotAcceptable = 406,
  ErrRequestTimeout = 408,
  ErrConflict = 409,
  ErrInvalidParameter = 422,
  SrvErrInternalServerError = 500,
}
export enum RoutingNames {
  configure = 'configure',
  busses = 'busses',
  specifications = 'specifications',
  slaves = 'slaves',
  specification = 'specification',
}
export enum PollModes {
  intervall = 0,
  trigger = 1,
  intervallAndTrigger = 2,
  noPoll = 3,
  intervallHttpPushNoMqtt = 4, // interval poll + HTTP push, no MQTT state publishing
}
export interface IhttpPush {
  url: string // full target URL, may contain {{ path }} placeholders, e.g. https://heimvio.de/readings/{{ serialnumber }}; reserved: {{ pollDate }} = poll time as ISO 8601 UTC, {{ slaveName }} = the slave's name
  patEnc?: string // AES-256-GCM encrypted Bearer PAT (base64), see secureSecret.ts
  pushEntities?: number[] // entity ids to include in the push payload
  root?: string // optional path (mqttname format) selecting a subtree of the push payload, e.g. "orbis"
}
export interface ImqttClient {
  mqttserverurl?: string
  ssl?: boolean
  host?: string
  port?: number
  protocol?: string
  username?: string
  password?: string | Uint8Array
  clientId?: string
  connectTimeout?: number
  clean?: boolean
  reconnectPeriod?: number
  keepalive?: number
  will?: unknown
  key?: string | Uint8Array
  ca?: string | Uint8Array
  cert?: string | Uint8Array
  log?: (...args: unknown[]) => void
}

// Modbus RTU framing. The Modbus specification asks for even parity (8E1), but most devices ship
// with 8N1, so that stays the default when nothing is configured. Devices that insist on 8E1 or 8N2
// could not be reached at all before these settings existed.
export type SerialParity = 'none' | 'even' | 'odd'
export const DEFAULT_SERIAL_DATABITS = 8
export const DEFAULT_SERIAL_PARITY: SerialParity = 'none'
export const DEFAULT_SERIAL_STOPBITS = 1
export interface IRTUConnection {
  serialport: string
  baudrate: number
  timeout: number
  tcpBridgePort?: number
  dataBits?: number // 7 or 8, default 8
  parity?: SerialParity // default none
  stopBits?: number // 1 or 2, default 1
}
export interface ITCPConnection {
  host: string
  port: number
  timeout: number
}

export type IModbusConnection = IRTUConnection | ITCPConnection

export interface Iconfiguration {
  githubPersonalToken?: string
  version: string
  fakeModbus: boolean
  mqttbasetopic: string
  mqttdiscoveryprefix: string
  mqttdiscoverylanguage: string
  mqttusehassio?: boolean
  mqttconnect: ImqttClient
  mqttcaFile?: string
  mqttkeyFile?: string
  mqttcertFile?: string
  httpport: number
  httpsPort?: number
  httpsCertFile?: string
  httpsKeyFile?: string
  rootUrl?: string
  frontendDir?: string
  supervisor_host?: string
  debugComponents?: string
  tcpBridgePort?: number
  displayHex?: boolean
  appVersion?: string
}
export interface IUserAuthenticationStatus {
  hassiotoken: boolean
  oidcEnabled: boolean
  authenticated: boolean
  user?: { name?: string; email?: string }
  mqttConfigured: boolean
  preSelectedBusId?: number
}
export interface IBus {
  busId: number
  connectionData: IModbusConnection
  slaves: Islave[]
}
// The framing as the modbus world writes it: 8N1, 8E1, 8N2 ...
export function getSerialFraming(connection: IRTUConnection): string {
  const parity = connection.parity ?? DEFAULT_SERIAL_PARITY
  return (
    (connection.dataBits ?? DEFAULT_SERIAL_DATABITS).toString() +
    parity.charAt(0).toUpperCase() +
    (connection.stopBits ?? DEFAULT_SERIAL_STOPBITS).toString()
  )
}
export function getConnectionName(connection: IModbusConnection): string {
  if ((connection as IRTUConnection).baudrate) {
    const c = connection as IRTUConnection
    return 'RTU: ' + c.serialport + '(' + c.baudrate + ' ' + getSerialFraming(c) + ') t: ' + c.timeout
  } else {
    const c = connection as ITCPConnection
    return 'TCP: ' + c.host + ':' + c.port + ' t: ' + (c.timeout ? c.timeout : 100)
  }
}
export interface ImodbusError {
  entityId: number
  message: string
}
export enum ModbusErrorStates {
  noerror,
  timeout,
  crc,
  other,
  illegalfunctioncode,
  illegaladdress,
  initialConnect,
  // States of the non-modbus tasks (mqttPublish, httpPush). New members must be appended,
  // the numeric values are persisted in cached error lists.
  connection, // broker/endpoint unreachable, refused, DNS failure
  httpStatus, // HTTP push answered with a non 2xx status
  configuration, // push URL placeholder or root path could not be resolved
}

export interface ImodbusAddress {
  address: number
  registerType: ModbusRegisterType
  write?: number[]
  length?: number
}
export enum ModbusTasks {
  deviceDetection = 0,
  splitted = 1,
  tcpBridge = 2,
  poll = 3,
  specification = 4,
  entity = 5,
  writeEntity = 6,
  initialConnect = 7,
  // Tasks which don't talk modbus. They share the per slave error list so the UI shows every
  // failure of a poll cycle in one place. Append only: the value indexes requestCount.
  mqttPublish = 8,
  httpPush = 9,
}
// A failure of one task of a slave. Modbus tasks carry the failing register address, the
// transport tasks (mqttPublish, httpPush) carry a message instead - they have no address.
export interface ImodbusErrorsForSlave {
  task: ModbusTasks
  date: number
  address?: ImodbusAddress
  state: ModbusErrorStates
  message?: string
  // Everything needed to act on the failure but too volatile to group by: the resolved push url of
  // an http push (it may carry the poll time), the topic of a failed publish. The UI groups the
  // errors by message and shows the detail of the most recent one.
  detail?: string
}
export interface ImodbusStatusForSlave {
  requestCount: number[]
  errors: ImodbusErrorsForSlave[]
  queueLength: number
}
export interface Islave {
  slaveid: number
  // Inherits every field except slaveid/name/rootTopic from this slave of the same bus. The referenced
  // slave must not be a reference itself (one level only). Persisted slaves carry only the own fields;
  // the inherited ones are materialized in memory (see ConfigBus.resolveReference).
  referenceSlaveId?: number
  specificationid?: string
  name?: string
  pollInterval?: number
  pollSchedule?: string // optional Unix cron expression (e.g. "0 * * * *" = every full hour); when set it replaces pollInterval
  pollMode?: PollModes
  specification?: Ispecification
  durationOfLongestModbusCall?: number
  modbusTimout?: number
  evalTimeout?: boolean
  detectSpec?: boolean // Will be set when creating a slave. If true, modbus2mqtt will set a specification matching to the modbusdata if there is one
  qos?: number
  rootTopic?: string
  noDiscoverEntities?: number[]
  noDiscovery?: boolean
  configurationUrl?: string
  httpPush?: IhttpPush
  modbusStatusForSlave?: ImodbusStatusForSlave
  maxRegistersPerRequest?: number // Default 125
}

// The only fields a referencing (child) slave owns. Everything else is inherited from the referenced
// slave and is neither persisted on the child nor accepted from a client. Single source of truth for
// ConfigBus.resolveReference() and BusPersistence.writeSlave().
export const OWN_SLAVE_FIELDS: (keyof Islave)[] = ['slaveid', 'name', 'rootTopic', 'referenceSlaveId']
export interface IidentificationSpecification {
  filename: string
  name?: string
  status: SpecificationStatus
  identified: IdentifiedStates
  entities: IidentEntity[]
}
