import Debug from 'debug'
import { Slave } from '../shared/server/index.js'
import { ImodbusSpecification } from '../shared/specification/index.js'
import { LogLevelEnum, Logger } from '../specification/index.js'
import { decryptSecret } from './secureSecret.js'

const debug = Debug('httppush')
const log = new Logger('httppush')

export class HttpPush {
  // Pushes the slave's selected entity values to the configured URL via HTTP POST.
  // Errors are logged but never thrown — a failed push must not stop polling or MQTT.
  static async pushState(slave: Slave, spec: ImodbusSpecification): Promise<void> {
    const httpPush = slave.getHttpPush()
    if (!slave.hasHttpPush() || !httpPush) return
    try {
      const url = slave.getResolvedHttpPushUrl(spec.entities)
      if (url == null) {
        log.log(LogLevelEnum.warn, 'HTTP push skipped: URL placeholder not resolvable url: ' + httpPush.url)
        return
      }
      const body = slave.getHttpPushPayload(spec.entities)
      if (body == null) {
        log.log(LogLevelEnum.warn, 'HTTP push skipped: root path "' + httpPush.root + '" not found url: ' + httpPush.url)
        return
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (httpPush.patEnc && httpPush.patEnc.length > 0) {
        headers['Authorization'] = 'Bearer ' + decryptSecret(httpPush.patEnc)
      }
      debug('HTTP push to ' + url + ' body: ' + body)
      const resp = await fetch(url, { method: 'POST', headers, body })
      if (!resp.ok) {
        log.log(LogLevelEnum.error, 'HTTP push failed: ' + resp.status + ' ' + resp.statusText + ' url: ' + httpPush.url)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.log(LogLevelEnum.error, 'HTTP push error: ' + msg + ' url: ' + httpPush.url)
    }
  }
}
