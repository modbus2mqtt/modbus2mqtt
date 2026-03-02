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
  ErrInvalidParameter = 422,
  SrvErrInternalServerError = 500,
}
export enum RoutingNames {
  login = 'login',
  register = 'register',
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

export interface IRTUConnection {
  serialport: string
  baudrate: number
  timeout: number
  tcpBridgePort?: number
}
export interface ITCPConnection {
  host: string
  port: number
  timeout: number
}

export type IModbusConnection = IRTUConnection | ITCPConnection

export interface Iconfiguration {
  password?: string
  username?: string
  githubPersonalToken?: string
  version: string
  fakeModbus: boolean
  noAuthentication: boolean
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
export enum AuthenticationErrors {
  EnvironmentVariableSecretNotSet = 1,
  HashError = 2,
  InvalidUserPasswordCombination = 3,
  InvalidParameters = 4,
  SignError = 5,
}

export interface IUserAuthenticationStatus {
  registered: boolean
  hassiotoken: boolean
  hasAuthToken?: boolean
  noAuthentication: boolean
  authTokenExpired?: boolean
  mqttConfigured: boolean
  preSelectedBusId?: number
}
export interface IBus {
  busId: number
  connectionData: IModbusConnection
  slaves: Islave[]
}
export function getConnectionName(connection: IModbusConnection): string {
  if ((connection as IRTUConnection).baudrate) {
    const c = connection as IRTUConnection
    return 'RTU: ' + c.serialport + '(' + c.baudrate + ') t: ' + c.timeout
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
}
export interface ImodbusErrorsForSlave {
  task: ModbusTasks
  date: number
  address: ImodbusAddress
  state: ModbusErrorStates
}
export interface ImodbusStatusForSlave {
  requestCount: number[]
  errors: ImodbusErrorsForSlave[]
  queueLength: number
}
export interface Islave {
  slaveid: number
  specificationid?: string
  name?: string
  pollInterval?: number
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
  modbusStatusForSlave?: ImodbusStatusForSlave
}
export interface IidentificationSpecification {
  filename: string
  name?: string
  status: SpecificationStatus
  identified: IdentifiedStates
  entities: IidentEntity[]
}
