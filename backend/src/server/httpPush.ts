import Debug from 'debug'
import { ModbusErrorStates, ModbusTasks, Slave } from '../shared/server/index.js'
import { ImodbusSpecification } from '../shared/specification/index.js'
import { LogLevelEnum, Logger } from '../specification/index.js'
import { decryptSecret } from './secureSecret.js'
import { countSlaveRequest, recordSlaveError } from './slaveStatus.js'

const debug = Debug('httppush')
const log = new Logger('httppush')

export class HttpPush {
  // Pushes the slave's selected entity values to the configured URL via HTTP POST.
  // Errors are logged and recorded in the slave's Status & Errors, but never thrown - a failed
  // push must not stop polling or MQTT.
  static async pushState(slave: Slave, spec: ImodbusSpecification, pollDate?: Date): Promise<void> {
    const httpPush = slave.getHttpPush()
    if (!slave.hasHttpPush() || !httpPush) return
    let url: string | null = null
    try {
      url = slave.getResolvedHttpPushUrl(spec.entities, pollDate)
      if (url == null) {
        // Nothing was sent, so the configured template is the only meaningful url to report.
        this.fail(slave, ModbusErrorStates.configuration, 'URL placeholder not resolvable', httpPush.url, LogLevelEnum.warn)
        return
      }
      const body = slave.getHttpPushPayload(spec.entities)
      if (body == null) {
        this.fail(slave, ModbusErrorStates.configuration, 'root path "' + httpPush.root + '" not found', url, LogLevelEnum.warn)
        return
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (httpPush.patEnc && httpPush.patEnc.length > 0) {
        headers['Authorization'] = 'Bearer ' + decryptSecret(httpPush.patEnc)
      }
      debug('HTTP push to ' + url + ' body: ' + body)
      const resp = await fetch(url, { method: 'POST', headers, body })
      if (!resp.ok) this.fail(slave, ModbusErrorStates.httpStatus, resp.status + ' ' + resp.statusText, url)
      else countSlaveRequest(slave, ModbusTasks.httpPush)
    } catch (e: unknown) {
      // fetch() rejects when the endpoint is unreachable (DNS, refused, TLS, abort)
      const msg = e instanceof Error ? e.message : String(e)
      this.fail(slave, ModbusErrorStates.connection, msg, url ?? httpPush.url)
    }
  }

  // Logs the url the push was actually sent to (placeholders resolved) - the template is of no use
  // when diagnosing a failing request. The recorded error keeps the plain message: a resolved url
  // may contain the poll time, which would make every single failure a group of its own in the UI.
  private static fail(
    slave: Slave,
    state: ModbusErrorStates,
    message: string,
    url: string,
    level: LogLevelEnum = LogLevelEnum.error
  ): void {
    log.log(level, 'HTTP push failed: ' + message + ' url: ' + url)
    recordSlaveError(slave, ModbusTasks.httpPush, state, message)
  }
}
