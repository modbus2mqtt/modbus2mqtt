import type { Application, Request, Response } from 'express'
import session from 'express-session'
import { randomBytes } from 'node:crypto'
import * as client from 'openid-client'
import { LogLevelEnum, Logger } from '../../specification/index.js'
import { ConfigPersistence } from '../persistence/configPersistence.js'

const log = new Logger('oidc')

export interface OidcConfig {
  config: client.Configuration
  issuerUrl: string
  clientId: string
  callbackUrl: string
}

export interface AuthSession {
  authenticated?: boolean
  userName?: string
  userEmail?: string
  sub?: string
  oidcState?: string
  oidcNonce?: string
}

function serializeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { error: String(err) }
  const e = err as Error & { code?: string; cause?: unknown }
  const cause =
    e.cause instanceof Error
      ? { message: e.cause.message, code: (e.cause as { code?: string }).code, stack: e.cause.stack }
      : e.cause
  return {
    name: e.name,
    message: e.message,
    code: e.code,
    cause,
    stack: e.stack,
  }
}

function logOidcFailure(message: string, err: unknown, oidcConfig?: OidcConfig, reqContext?: Record<string, unknown>): void {
  if (oidcConfig) {
    log.log(
      LogLevelEnum.info,
      `[oidc] Active config (on failure) ${JSON.stringify({
        issuer: oidcConfig.issuerUrl,
        client_id: oidcConfig.clientId,
        callback: oidcConfig.callbackUrl,
      })}`
    )
  }
  if (reqContext) {
    log.log(LogLevelEnum.info, `[oidc] Request context (on failure) ${JSON.stringify(reqContext)}`)
  }
  log.log(LogLevelEnum.error, `${message} ${JSON.stringify(serializeError(err))}`)
}

export async function initOidc(): Promise<OidcConfig | null> {
  if (process.env.OIDC_ENABLED !== 'true') {
    log.log(LogLevelEnum.info, '[oidc] OIDC authentication: DISABLED (OIDC_ENABLED != true)')
    return null
  }

  const issuerUrl = process.env.OIDC_ISSUER_URL
  const clientId = process.env.OIDC_CLIENT_ID
  const clientSecret = process.env.OIDC_CLIENT_SECRET
  const callbackUrl = process.env.OIDC_CALLBACK_URL

  if (!issuerUrl || !clientId || !clientSecret || !callbackUrl) {
    log.log(
      LogLevelEnum.error,
      '[oidc] OIDC authentication: DISABLED — OIDC_ENABLED=true but required env vars missing (OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_CALLBACK_URL)'
    )
    return null
  }

  try {
    const discoveryOptions: Parameters<typeof client.discovery>[4] =
      new URL(issuerUrl).protocol === 'http:' ? { execute: [client.allowInsecureRequests] } : undefined
    const config = await client.discovery(new URL(issuerUrl), clientId, { client_secret: clientSecret }, undefined, discoveryOptions)
    log.log(LogLevelEnum.info, `[oidc] OIDC authentication: ENABLED — issuer=${issuerUrl} client_id=${clientId} callback=${callbackUrl}`)
    return { config, issuerUrl, clientId, callbackUrl }
  } catch (err) {
    log.log(
      LogLevelEnum.error,
      `[oidc] OIDC authentication: FAILED — could not reach issuer ${issuerUrl} ${JSON.stringify(serializeError(err))}`
    )
    return null
  }
}

export function setupSession(app: Application): void {
  const envSecret = process.env.OIDC_SESSION_SECRET
  let secret: string
  if (envSecret && envSecret.length > 0) {
    secret = envSecret
  } else {
    try {
      secret = new ConfigPersistence().ensureSecret()
    } catch {
      secret = randomBytes(32).toString('hex')
    }
  }
  app.use(
    session({
      secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  )
}

export function registerOidcRoutes(app: Application, oidcConfig: OidcConfig): void {
  app.get('/api/auth/config', (req: Request, res: Response) => {
    const sess = req.session as AuthSession
    const authenticated = !!sess?.authenticated
    const result: { oidcEnabled: boolean; authenticated: boolean; user?: { name?: string; email?: string } } = {
      oidcEnabled: true,
      authenticated,
    }
    if (authenticated) {
      const user: { name?: string; email?: string } = {}
      if (sess.userName) user.name = sess.userName
      if (sess.userEmail) user.email = sess.userEmail
      result.user = user
    }
    res.json(result)
  })

  app.get('/api/auth/login', (req: Request, res: Response) => {
    const state = client.randomState()
    const nonce = client.randomNonce()
    const sess = req.session as AuthSession
    sess.oidcState = state
    sess.oidcNonce = nonce
    const authUrl = client.buildAuthorizationUrl(oidcConfig.config, {
      redirect_uri: oidcConfig.callbackUrl,
      scope: 'openid email profile',
      state,
      nonce,
      response_type: 'code',
    })
    res.redirect(authUrl.href)
  })

  app.get('/api/auth/callback', async (req: Request, res: Response): Promise<void> => {
    const sess = req.session as AuthSession
    const expectedState = sess.oidcState
    const expectedNonce = sess.oidcNonce
    if (!expectedState || !expectedNonce) {
      res.status(400).send('Invalid session state. Please try logging in again.')
      return
    }
    try {
      const currentUrl = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`)
      const tokenResponse = await client.authorizationCodeGrant(oidcConfig.config, currentUrl, { expectedState, expectedNonce })
      const claims = tokenResponse.claims()
      if (!claims) {
        res.status(403).send('No ID token received from identity provider.')
        return
      }
      const claimsRecord = claims as Record<string, unknown>

      // Merge UserInfo endpoint (providers like Zitadel put name/email there)
      try {
        const userinfoEndpoint = oidcConfig.config.serverMetadata().userinfo_endpoint
        if (userinfoEndpoint) {
          const userinfoResp = await fetch(userinfoEndpoint, {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
          })
          if (userinfoResp.ok) {
            const userinfo = (await userinfoResp.json()) as Record<string, unknown>
            for (const [k, v] of Object.entries(userinfo)) {
              if (claimsRecord[k] == null) claimsRecord[k] = v
            }
          }
        }
      } catch (err) {
        log.log(LogLevelEnum.warn, `[oidc] UserInfo fetch error ${JSON.stringify(serializeError(err))}`)
      }

      const nameCandidate =
        (typeof claimsRecord.name === 'string' && claimsRecord.name) ||
        (typeof claimsRecord.preferred_username === 'string' && claimsRecord.preferred_username) ||
        [
          typeof claimsRecord.given_name === 'string' ? claimsRecord.given_name : '',
          typeof claimsRecord.family_name === 'string' ? claimsRecord.family_name : '',
        ]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        (typeof claimsRecord.email === 'string' && claimsRecord.email) ||
        ''

      sess.authenticated = true
      if (nameCandidate) sess.userName = nameCandidate
      if (typeof claimsRecord.email === 'string') sess.userEmail = claimsRecord.email
      sess.sub = claims.sub
      delete sess.oidcState
      delete sess.oidcNonce

      log.log(LogLevelEnum.info, `[oidc] User logged in: ${sess.userName || claims.sub}`)
      res.redirect('/')
    } catch (err) {
      logOidcFailure('[oidc] Callback error', err, oidcConfig, {
        protocol: req.protocol,
        host: req.get('host'),
        original_url: req.originalUrl,
        has_state_param: req.query.state != null,
        has_code_param: req.query.code != null,
      })
      res.status(500).send('Authentication failed. Please try again.')
    }
  })

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) log.log(LogLevelEnum.error, `[oidc] Logout error ${JSON.stringify(serializeError(err))}`)
      const endSessionEndpoint = oidcConfig.config.serverMetadata().end_session_endpoint
      if (endSessionEndpoint) {
        const url = new URL(endSessionEndpoint)
        url.searchParams.set('post_logout_redirect_uri', oidcConfig.callbackUrl.replace('/api/auth/callback', '/'))
        res.json({ redirectUrl: url.href })
      } else {
        res.json({ redirectUrl: '/' })
      }
    })
  })
}
