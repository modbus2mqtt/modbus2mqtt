import type { NextFunction, Request, Response } from 'express'
import { AddressInfo } from 'net'
import { LogLevelEnum, Logger } from '../../specification/index.js'
import { apiUri } from '../../shared/server/index.js'
import { MqttSubscriptions } from '../mqttsubscriptions.js'
import type { AuthSession, OidcConfig } from './oidc.js'

const log = new Logger('authMiddleware')

const HA_IP_PREFIXES = ['172.30.33', '172.30.32', '127.0.0.1', '::1']

function isHomeAssistantIp(req: Request): boolean {
  const address = (req.socket.address() as AddressInfo).address
  if (!address) return false
  return HA_IP_PREFIXES.some((prefix) => address.indexOf(prefix) >= 0)
}

function isProtectedPath(url: string): boolean {
  if (url.indexOf('/api/') >= 0) return true
  if (url.indexOf('/download/') >= 0) return true
  const slaveTopics = MqttSubscriptions.getInstance().getSlaveBaseTopics()
  return !!slaveTopics.find((tp) => tp.startsWith(url.substring(1)))
}

const PUBLIC_API_PATHS = [
  apiUri.userAuthenticationStatus,
  apiUri.authConfig,
  apiUri.authLogin,
  apiUri.authCallback,
  apiUri.authLogout,
  apiUri.converters,
]

function isPublicPath(url: string): boolean {
  return PUBLIC_API_PATHS.some((p) => url === p || url.startsWith(p + '?'))
}

export function createAuthMiddleware(oidcConfig: OidcConfig | null) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // E2E reset bypass
    if (process.env.MODBUS2MQTT_E2E && req.url === apiUri.e2eReset) {
      next()
      return
    }

    // Public endpoints - always accessible
    if (isPublicPath(req.url)) {
      next()
      return
    }

    // Only gate protected paths
    if (!isProtectedPath(req.url)) {
      next()
      return
    }

    // 1) Home Assistant mode: IP whitelist, no user auth
    if (process.env.HASSIO_TOKEN && process.env.HASSIO_TOKEN.length > 0) {
      if (isHomeAssistantIp(req)) {
        next()
        return
      }
      const address = (req.socket.address() as AddressInfo).address
      log.log(LogLevelEnum.warn, 'Denied: IP Address is not allowed ' + address)
      res.status(403).send('Unauthorized (See server log)')
      return
    }

    // 2) OIDC mode: require authenticated session
    if (oidcConfig) {
      const sess = req.session as AuthSession | undefined
      if (sess?.authenticated) {
        next()
        return
      }
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    // 3) Default: open access (neither HA nor OIDC configured)
    next()
  }
}
