import { Bonjour } from 'bonjour-service'
import { ImqttClient } from '../shared/server/index.js'
import { Config } from './config.js'
import { MqttConnector } from './mqttconnector.js'
import { LogLevelEnum, Logger } from '../specification/index.js'

const log = new Logger('MqttAutoDiscover')

/**
 * Auto-discovers an MQTT broker while none is configured yet.
 *
 * Tries, in order, as long as no mqttserverurl is configured:
 *   1. mqtt://mosquitto:1883  (anonymous — the conventional broker hostname
 *      in Docker / Home Assistant / ESPHome LAN setups)
 *   2. mDNS/DNS-SD: brokers announce themselves as "_mqtt._tcp.local"
 *      (plain) or "_mqtts._tcp.local" (TLS); connect to the first that
 *      accepts a connection.
 *
 * When a working broker is found it is persisted to the configuration and
 * the MQTT connector is reset so it reconnects with the discovered URL.
 * If nothing is found the probe is repeated on a timer.
 */
export class MqttAutoDiscover {
  private static instance: MqttAutoDiscover | undefined = undefined
  private probeTimer: ReturnType<typeof setTimeout> | undefined
  private running = false

  static getInstance(): MqttAutoDiscover {
    if (!MqttAutoDiscover.instance) MqttAutoDiscover.instance = new MqttAutoDiscover()
    return MqttAutoDiscover.instance
  }

  static resetInstance(): void {
    if (MqttAutoDiscover.instance) {
      MqttAutoDiscover.instance.stop()
      MqttAutoDiscover.instance = undefined
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.probe()
  }

  stop(): void {
    this.running = false
    if (this.probeTimer) {
      clearTimeout(this.probeTimer)
      this.probeTimer = undefined
    }
  }

  private isConfigured(): boolean {
    const cfg = Config.getConfiguration()
    if (cfg.mqttusehassio) return true // HA add-on provides the broker
    const url = cfg.mqttconnect && cfg.mqttconnect.mqttserverurl
    return !!url
  }

  private async probe(): Promise<void> {
    if (!this.running) return
    if (this.isConfigured()) {
      this.stop()
      return
    }

    // 1) conventional broker hostname first
    const conventional: ImqttClient = { mqttserverurl: 'mqtt://mosquitto:1883' }
    if (await this.tryConnect(conventional, 'conventional mqtt://mosquitto:1883')) return

    // 2) mDNS/DNS-SD browse for MQTT brokers
    const discovered = await this.browseMdns()
    if (discovered) return

    // nothing found yet — retry later while still unconfigured
    if (!this.running) return
    this.probeTimer = setTimeout(() => this.probe(), 15000)
  }

  private async browseMdns(): Promise<boolean> {
    const bonjour = new Bonjour()
    const found: { url: string; label: string }[] = []
    const services: { name: string; port: number; addresses: string[]; txt: Record<string, string> | undefined }[] = []

    const collect = (s: { name?: string; fqdn?: string; host?: string; port?: number; addresses?: string[]; txt?: Record<string, string>; type?: string }) => {
      const port = s.port || 1883
      // Prefer the stable SRV hostname (e.g. "mosquitto") over the resolved IP so
      // the discovered broker URL stays valid if the container IP changes.
      const clean = (s.host || '').trim().replace(/\.local$/, '')
      const isIp = /^[0-9.]+$/.test(clean) || clean === 'localhost'
      const addr = (clean && !isIp) ? clean : ((s.addresses && s.addresses.length) ? s.addresses[0] : (clean || 'localhost'))
      services.push({ name: s.name || 'mqtt', port, addresses: [addr], txt: s.txt })
    }

    return await new Promise<boolean>((resolvePromise) => {
      let settled = false
      const settle = (ok: boolean) => {
        if (settled) return
        settled = true
        try { bonjour.destroy() } catch { /* ignore */ }
        resolvePromise(ok)
      }

      try {
        const browser = bonjour.find({ type: 'mqtt', protocol: 'tcp' })
        const browserTls = bonjour.find({ type: 'mqtts', protocol: 'tcp' })
        browser.on('up', collect)
        browserTls.on('up', collect)

        // collect for a short window, then evaluate candidates
        setTimeout(async () => {
          const scheme = 'mqtt'
          const seen = new Set<string>()
          for (const s of services) {
            const host = s.addresses[0] || 'localhost'
            const url = `${scheme}://${host}:${s.port}`
            if (seen.has(url)) continue
            seen.add(url)
            found.push({ url, label: `${s.name} @ ${host}:${s.port}` })
          }
          for (const cand of found) {
            if (!this.running) { settle(false); return }
            if (await this.tryConnect({ mqttserverurl: cand.url }, `mDNS ${cand.label}`)) { settle(true); return }
          }
          settle(false)
        }, 4000)
      } catch (e) {
        log.log(LogLevelEnum.error, 'mDNS browse error: ' + (e instanceof Error ? e.message : String(e)))
        settle(false)
      }
    })
  }

  /** Try to validate a broker and if it connects, persist + reconnect. Returns true on success. */
  private async tryConnect(client: ImqttClient, label: string): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      try {
        MqttConnector.getInstance().validateConnection(client, (valid, message) => {
          if (valid) {
            log.log(LogLevelEnum.info, `MQTT auto-discovery: connected via ${label}`)
            this.persist(client)
            resolve(true)
          } else {
            log.log(LogLevelEnum.info, `MQTT auto-discovery: ${label} failed (${message})`)
            resolve(false)
          }
        })
      } catch (e) {
        log.log(LogLevelEnum.error, 'MQTT auto-discovery probe error: ' + (e instanceof Error ? e.message : String(e)))
        resolve(false)
      }
    })
  }

  private persist(client: ImqttClient): void {
    try {
      const cfg = Config.getConfiguration()
      if (!cfg.mqttconnect) cfg.mqttconnect = {}
      // keep user/password/ssl files if they were ever set; else set anonymous
      const mqttconnect = cfg.mqttconnect as Record<string, unknown>
      mqttconnect.mqttserverurl = client.mqttserverurl
      if (mqttconnect.username === undefined) mqttconnect.username = ''
      if (mqttconnect.password === undefined) mqttconnect.password = ''
      new Config().writeConfiguration(cfg)
      MqttConnector.resetInstance()
      log.log(LogLevelEnum.info, 'MQTT auto-discovery: configuration persisted, reconnecting...')
    } catch (e) {
      log.log(LogLevelEnum.error, 'MQTT auto-discovery persist failed: ' + (e instanceof Error ? e.message : String(e)))
    }
  }
}
