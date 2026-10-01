import { Bonjour } from 'bonjour-service'
import dnsDefault from 'dns/promises'
import { Socket } from 'net'
import * as os from 'os'
import { Config } from './config.js'
import { ConfigBus } from './configbus.js'
import { LogLevelEnum, Logger } from '../specification/index.js'
import { scanNamedHosts } from './NetworkScanner.js'

const log = new Logger('ModbusAutoDiscover')

export interface DiscoveredModbusServer {
  name: string
  host: string
  port: number
}

/**
 * Discovers Modbus TCP servers over mDNS/DNS-SD ("_modbus._tcp.local" /
 * "_modbus-tcp"). Unlike the previous auto-add behaviour it does NOT create
 * connections on its own — it only keeps a fresh list of advertised servers,
 * excludes blacklisted ones and exposes them through the API so the webui can
 * offer "Add server" / "Ignore" actions.
 */
export class ModbusAutoDiscover {
  private static instance: ModbusAutoDiscover | undefined = undefined
  private probeTimer: ReturnType<typeof setTimeout> | undefined
  private running = false
  private discovered: DiscoveredModbusServer[] = []
  private lastUsableKeys: Set<string> | undefined = undefined

  static getInstance(): ModbusAutoDiscover {
    if (!ModbusAutoDiscover.instance) ModbusAutoDiscover.instance = new ModbusAutoDiscover()
    return ModbusAutoDiscover.instance
  }

  static resetInstance(): void {
    if (ModbusAutoDiscover.instance) {
      ModbusAutoDiscover.instance.stop()
      ModbusAutoDiscover.instance = undefined
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.scan()
  }

  stop(): void {
    this.running = false
    if (this.probeTimer) {
      clearTimeout(this.probeTimer)
      this.probeTimer = undefined
    }
  }

  /** Servers currently advertised on the LAN that are not blacklisted and not already configured. */
  getDiscoveredServers(): DiscoveredModbusServer[] {
    const blacklist = this.getBlacklist()
    const configured = this.configuredBusses()
    return this.discovered.filter((s) => {
      if (blacklist.includes(this.key(s.host, s.port))) return false
      // Skip devices that are already set up as a Modbus connection
      return !configured.some((c) => this.key(c.host, c.port) === this.key(s.host, s.port))
    })
  }

  /** Host/port of already-configured TCP Modbus busses. */
  private configuredBusses(): { host: string; port: number }[] {
    try {
      const rc: { host: string; port: number }[] = []
      ConfigBus.getBussesProperties().forEach((b) => {
        const c = b.connectionData as { host?: string; port?: number }
        if (c.host) rc.push({ host: c.host, port: c.port || 502 })
      })
      return rc
    } catch {
      return []
    }
  }

  blacklistServer(host: string, port: number): void {
    try {
      const cfg = Config.getConfiguration()
      const blacklist = cfg.modbusAutoDiscoverBlacklist || (cfg.modbusAutoDiscoverBlacklist = [])
      const key = this.key(host, port)
      if (!blacklist.includes(key)) blacklist.push(key)
      cfg.modbusAutoDiscoverBlacklist = blacklist
      new Config().writeConfiguration(cfg)
      log.log(LogLevelEnum.info, `Modbus auto-discovery: blacklisted ${host}:${port}`)
    } catch (e) {
      log.log(
        LogLevelEnum.error,
        'Modbus auto-discovery: blacklist persist failed: ' + (e instanceof Error ? e.message : String(e))
      )
    }
  }

  private getBlacklist(): string[] {
    try {
      return Config.getConfiguration().modbusAutoDiscoverBlacklist || []
    } catch {
      return []
    }
  }

  private key(host: string, port: number): string {
    return host + ':' + port
  }

  /** Prefers the hostname over an IP literal for a connection host. */
  private preferHostname(host: string | undefined, addresses: string[] | undefined): string {
    const clean = (host || '').trim().replace(/\.local$/, '')
    const isIp = /^[0-9.]+$/.test(clean) || clean === 'localhost'
    if (clean && !isIp) return clean
    return addresses && addresses.length ? addresses[0] : clean || 'localhost'
  }

  private async scan(): Promise<void> {
    if (!this.running) return

    const bonjour = new Bonjour()
    try {
      const b1 = bonjour.find({ type: 'modbus', protocol: 'tcp' })
      const b2 = bonjour.find({ type: 'modbus-tcp', protocol: 'tcp' })
      const seen = new Map<string, DiscoveredModbusServer>()

      const collect = (s: { name?: string; port?: number; addresses?: string[]; host?: string }) => {
        const port = s.port || 502
        // Prefer the stable SRV hostname (e.g. "mbusd") over the resolved IP so
        // the saved connection keeps working when the container's IP changes.
        // Skip pure IP literals / localhost for the hostname field.
        const host = this.preferHostname(s.host, s.addresses)
        seen.set(this.key(host, port), { name: s.name || 'modbus', host, port })
      }
      b1.on('up', collect)
      b2.on('up', collect)

      // collect for a short window, then merge into the known set.
      // mDNS announcements are intermittent, so keep servers from earlier
      // scans even if a single scan misses them (only a blacklist or a full
      // process restart removes them).
      await new Promise<void>((r) => setTimeout(r, 4000))
      const merged = new Map<string, DiscoveredModbusServer>()
      this.discovered.forEach((s) => merged.set(this.key(s.host, s.port), s))
      seen.forEach((v, k) => merged.set(k, v))

      // Resiliency fallback: also probe well-known Modbus TCP endpoints by
      // Docker-DNS name (mbusd:502 / modbus:502). This works even when mDNS
      // announcements are not heard (e.g. peer on a non-default interface).
      const endpointServers = await this.probeKnownEndpoints()
      endpointServers.forEach((srv) => merged.set(this.key(srv.host, srv.port), srv))

      // Docker-network fallback (opt-in via config): ask the Docker embedded
      // DNS which hosts are known on our networks and TCP-probe them for a
      // Modbus listener. This finds servers that do not announce mDNS at all
      // and avoids the multicast-does-not-cross-bridge limitation.
      if (this.networkScanEnabled()) {
        const named = await this.probeNamedHosts()
        named.forEach((srv) => merged.set(this.key(srv.host, srv.port), srv))
      }

      this.discovered = Array.from(merged.values())
      const live = this.getDiscoveredServers().length
      // Keep scanning so newly appearing servers are still detected even when
      // one is already configured, but only log when the usable set changes
      // (something new appeared or disappeared) to avoid spamming every 20s.
      const currentKeys = new Set(this.getDiscoveredServers().map((d) => this.key(d.host, d.port)))
      const previousKeys = this.lastUsableKeys || new Set()
      const changed = currentKeys.size !== previousKeys.size || [...currentKeys].some((k) => !previousKeys.has(k))
      this.lastUsableKeys = currentKeys
      if (changed && live >= 1) {
        log.log(LogLevelEnum.info, `Modbus auto-discovery: found ${this.discovered.length} server(s), ${live} usable`)
      }
    } catch (e) {
      log.log(LogLevelEnum.error, 'Modbus mDNS browse error: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      try {
        bonjour.destroy()
      } catch {
        /* ignore */
      }
    }

    if (!this.running) return
    this.probeTimer = setTimeout(() => this.scan(), 20000)
  }

  /** Well-known Docker-DNS Modbus TCP endpoints to probe as a fallback. */
  private knownEndpoints(): { host: string; port: number }[] {
    return [
      { host: 'mbusd', port: 502 },
      { host: 'modbus', port: 502 },
    ]
  }

  /**
   * Resolves well-known endpoint hostnames via Docker DNS and probes port 502.
   * The resolved IP is only used for reachability; the stable hostname is the
   * connection `host` so a saved bus survives DHCP/network IP changes.
   */
  private async probeKnownEndpoints(): Promise<DiscoveredModbusServer[]> {
    const found: DiscoveredModbusServer[] = []
    for (const ep of this.knownEndpoints()) {
      try {
        const addrs = await this.dns.lookup(ep.host, { all: true })
        for (const a of addrs) {
          if (await this.tcpProbe(a.address, ep.port)) {
            found.push({ name: ep.host, host: ep.host, port: ep.port })
            log.log(LogLevelEnum.info, `Modbus auto-discovery: endpoint ${ep.host}:${ep.port} reachable (via ${a.address})`)
          }
        }
      } catch {
        /* hostname not resolvable (not on this Docker network) - fine */
      }
    }
    return found
  }

  // injectable for tests (real default: dns/promises)
  private dns: typeof dnsDefault
  private constructor() {
    this.dns = dnsDefault
  }

  /** Opens a TCP socket to host:port and returns true if the connection succeeds. */
  private async tcpProbe(host: string, port: number, timeoutMs = 2500): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      const sock = new Socket()
      let done = false
      const finish = (ok: boolean) => {
        if (done) return
        done = true
        try {
          sock.destroy()
        } catch {
          /* ignore */
        }
        resolve(ok)
      }
      sock.setTimeout(timeoutMs)
      sock.once('connect', () => finish(true))
      sock.once('timeout', () => finish(false))
      sock.once('error', () => finish(false))
      try {
        sock.connect(port, host)
      } catch {
        finish(false)
      }
    })
  }

  /** Whether the Docker-network host sweep is enabled in the configuration. */
  private networkScanEnabled(): boolean {
    try {
      return Config.getConfiguration().modbusAutoDiscoverNetworkScan === true
    } catch {
      return false
    }
  }

  /**
   * Asks the Docker embedded DNS which hosts are known on our networks and
   * TCP-probes them for a Modbus listener. Returns stable hostnames as the
   * connection `host` so a saved bus survives IP changes (same policy as
   * `probeKnownEndpoints`).
   */
  private async probeNamedHosts(): Promise<DiscoveredModbusServer[]> {
    // Honor the configuration even when called directly: with network scanning
    // disabled there is nothing to probe and the DNS/port sweeps would just
    // hang until their timeouts (which is also what the CI test expects).
    if (!this.networkScanEnabled()) return []
    const interfaces = this.localInterfaces()
    const found: DiscoveredModbusServer[] = []
    for (const host of await scanNamedHosts(this.dns, (h, p, t) => this.tcpProbe(h, p, t), interfaces)) {
      found.push({ name: host.host, host: host.host, port: 502 })
      log.log(LogLevelEnum.info, `Modbus auto-discovery: Docker network host ${host.host} (${host.address}) reachable`)
    }
    return found
  }

  /** IPv4 non-internal interfaces of this container (used by the sweep). */
  private localInterfaces(): { address: string; netmask: string; family: string; internal: boolean }[] {
    const out: { address: string; netmask: string; family: string; internal: boolean }[] = []
    try {
      Object.values(os.networkInterfaces()).forEach((addrs) => {
        if (addrs)
          addrs.forEach((a) => out.push({ address: a.address, netmask: a.netmask, family: a.family, internal: a.internal }))
      })
    } catch {
      /* ignore */
    }
    return out
  }
}
