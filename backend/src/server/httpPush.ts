import Debug from 'debug'
import { ModbusErrorStates, ModbusTasks, Slave } from '../shared/server/index.js'
import { ImodbusSpecification } from '../shared/specification/index.js'
import { LogLevelEnum, Logger } from '../specification/index.js'
import { decryptSecret } from './secureSecret.js'
import { countSlaveRequest, recordSlaveError } from './slaveStatus.js'

const debug = Debug('httppush')
const log = new Logger('httppush')
const maxReasonLength = 200
// A push that fails, fails on every poll. Logging each one buries the log, so the same failure of the
// same slave is logged once and then only again after this interval - long enough to keep the log
// readable, short enough that a permanent failure keeps reminding of itself.
const repeatLogInterval = 60 * 60 * 1000 // 1 hour
// The poll time in the resolved url differs on every push and must not make two occurrences of the
// same failure look different. Matches the {{ pollDate }} substitution, encoded ("%3A") or not.
const pollDateInUrl = /\d{4}-\d{2}-\d{2}T\d{2}(?::|%3A)\d{2}(?::|%3A)\d{2}Z/gi

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
      // An empty payload means no entity is selected under "Select entities to push". Posting "{}"
      // is never what anyone wants - the endpoint rejects it (400) or, worse, stores nothing and says
      // OK. Report it as the configuration mistake it is instead of sending it.
      if (body == '{}' || body == '[]') {
        this.fail(slave, ModbusErrorStates.configuration, 'No entities selected to push - nothing to send', url, LogLevelEnum.warn)
        return
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (httpPush.patEnc && httpPush.patEnc.length > 0) {
        headers['Authorization'] = 'Bearer ' + decryptSecret(httpPush.patEnc)
      }
      debug('HTTP push to ' + url + ' body: ' + body)
      const resp = await fetch(url, { method: 'POST', headers, body })
      if (!resp.ok) {
        // An endpoint that rejects a push almost always says why in its response body ("missing
        // field", "unknown id"). Throwing that away left the user with a bare "400 Bad Request".
        const reason = await this.readReason(resp)
        this.fail(slave, ModbusErrorStates.httpStatus, resp.status + ' ' + resp.statusText, url + (reason ? ' -> ' + reason : ''))
      } else {
        countSlaveRequest(slave, ModbusTasks.httpPush)
        this.clearFailure(slave)
      }
    } catch (e: unknown) {
      // fetch() rejects when the endpoint is unreachable (DNS, refused, TLS, abort)
      const msg = e instanceof Error ? e.message : String(e)
      this.fail(slave, ModbusErrorStates.connection, msg, url ?? httpPush.url)
    }
  }

  // The endpoint's own explanation of the rejection, shortened. Reading it must never turn a failed
  // push into a crash, and it must not paste a whole error page into the log, so it is guarded and
  // truncated.
  private static async readReason(resp: Response): Promise<string> {
    try {
      const text = (await resp.text()).trim().replace(/\s+/g, ' ')
      if (text.length == 0) return ''
      return text.length > maxReasonLength ? text.substring(0, maxReasonLength) + '…' : text
    } catch {
      return ''
    }
  }

  // The url the push was actually sent to (placeholders resolved) - the template is of no use when
  // diagnosing a failing request, and the add-on log has usually scrolled past it by the time anyone
  // looks. It travels as the error's detail, not in its message: a resolved url may carry the poll
  // time, and the UI groups the errors by message.
  private static fail(
    slave: Slave,
    state: ModbusErrorStates,
    message: string,
    url: string,
    level: LogLevelEnum = LogLevelEnum.info
  ): void {
    // Every failure is recorded: the slave's Status & Errors is where the severity and the count
    // belong. The log only reports it the first time - it repeats on every poll otherwise.
    recordSlaveError(slave, ModbusTasks.httpPush, state, message, url)
    if (HttpPush.shouldLog(slave, message, url)) log.log(level, 'HTTP push failed: ' + message + ' url: ' + url)
  }

  // Two failures are the same when the message and the url match - the poll time inside the url is
  // not part of the identity, it changes on every push. A failure is logged again once the interval
  // has passed, and immediately when it changes (a 400 turning into a 503 is news).
  private static readonly loggedFailures = new Map<string, { key: string; time: number }>()
  private static shouldLog(slave: Slave, message: string, url: string): boolean {
    const key = message + ' ' + url.replace(pollDateInUrl, '{{ pollDate }}')
    const last = HttpPush.loggedFailures.get(slave.getKey())
    const now = Date.now()
    if (last != undefined && last.key == key && now - last.time < repeatLogInterval) return false
    HttpPush.loggedFailures.set(slave.getKey(), { key, time: now })
    return true
  }
  // A push that works again must not silence the next failure.
  private static clearFailure(slave: Slave): void {
    HttpPush.loggedFailures.delete(slave.getKey())
  }
}
