/**
 * Docker-network aware Modbus TCP host discovery.
 *
 * On Docker user-defined networks the embedded DNS resolver (127.0.0.11)
 * answers PTR (reverse) queries for every container attached to those
 * networks, so an IP in our own subnet either resolves to a container
 * hostname or fails with NXDOMAIN. We exploit that to enumerate "all known
 * hosts" of our Docker network without needing the Docker socket:
 *
 *   1. enumerate the IPv4 candidates of our own subnets (from
 *      `os.networkInterfaces()`),
 *   2. reverse-resolve every candidate via the injectable `dns.reverse()`,
 *   3. TCP-probe every IP that resolves to a hostname on the Modbus port.
 *
 * Containers that listen on the Modbus TCP port are returned as candidates
 * with their (stable) hostname as `host`, so the saved bus keeps working
 * when the peer's IP changes.
 */

export interface NetworkHost {
  /** Stable hostname of the peer (from the DNS PTR record). */
  host: string
  /** IP we actually probed (informational). */
  address: string
}

export interface InterfaceInfo {
  address: string
  netmask: string
  family: string
  internal: boolean
}

export interface TcpProbe {
  (host: string, port: number, timeoutMs?: number): Promise<boolean>
}

export interface ReverseDns {
  reverse(ip: string): Promise<string[]>
}

/** Default probe timeout for a single host, in milliseconds. */
export const DEFAULT_PROBE_TIMEOUT_MS = 2500

/** Most containers from one compose project are placed within this many /24s. */
export const DEFAULT_MAX_HOSTS_PER_SUBNET = 254

const isIpv4 = (i: InterfaceInfo): boolean => i.family === 'IPv4' && !i.internal

/**
 * Returns the list of IPv4 candidate addresses for the given network
 * interfaces (own IP excluded) that are worth asking the Docker DNS about.
 * This is *not* a network scan — the candidates are only used for reverse
 * DNS lookups against the Docker embedded resolver, which only answers for
 * containers it knows about.
 */
export function subnetCandidates(interfaces: InterfaceInfo[], maxHostsPerSubnet = DEFAULT_MAX_HOSTS_PER_SUBNET): string[] {
  const seen = new Set<string>()
  interfaces.filter(isIpv4).forEach((inf) => {
    const { address, netmask } = inf
    const ip = address.split('.')
    const mask = (netmask || '255.255.255.0').split('.')
    if (ip.length !== 4 || mask.length !== 4) return
    // Network base = ip & mask (per octet)
    const base = ip.map((oct, i) => Number(oct) & Number(mask[i]))
    // Host count = number of 0-bits in the mask (capped so we do not sweep
    // huge ranges like /8 on a LAN interface).
    let hostBits = 0
    mask.forEach((oct) => {
      const v = Number(oct)
      for (let bit = 7; bit >= 0; bit--) if (((v >> bit) & 1) === 0) hostBits++
    })
    const total = Math.min(Math.max(1 << hostBits, 2), maxHostsPerSubnet + 2)
    // Own IP is skipped; also skip network base + broadcast (they never
    // reverse-resolve to a container hostname).
    for (let i = 1; i < total - 1; i++) {
      const oct3 = base[0] + '.' + base[1] + '.' + base[2] + '.' + (base[3] + i)
      if (oct3 === address) continue
      seen.add(oct3)
    }
  })
  return Array.from(seen)
}

/**
 * Enumerates the known Docker-network hosts that listen on `port` by
 * reverse-resolving every candidate IP and TCP-probing the hits.
 * Revealed probes are sequential (each waits for its own timeout), so a
 * previous probe is never cancelled; this keeps the behaviour deterministic
 * and testable.
 */
export async function scanNamedHosts(
  dns: ReverseDns,
  tcpProbe: TcpProbe,
  interfaces: InterfaceInfo[],
  port = 502,
  maxHostsPerSubnet = DEFAULT_MAX_HOSTS_PER_SUBNET
): Promise<NetworkHost[]> {
  const found: NetworkHost[] = []
  for (const candidate of subnetCandidates(interfaces, maxHostsPerSubnet)) {
    let names: string[]
    try {
      names = await dns.reverse(candidate)
    } catch {
      continue // NXDOMAIN / not a container -> nothing to probe
    }
    if (!names || names.length === 0) continue
    const hostname = names[0].replace(/\.$/, '')
    if (!hostname || hostname === 'localhost' || hostname === 'ip6-localhost') continue
    if (await tcpProbe(candidate, port, DEFAULT_PROBE_TIMEOUT_MS)) {
      found.push({ host: hostname, address: candidate })
    }
  }
  return found
}
