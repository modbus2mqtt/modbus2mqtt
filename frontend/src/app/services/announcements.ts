export interface Announcement {
  /** Unique, permanent identifier. Once published, never reuse. */
  id: string
  /** Short headline */
  title: string
  /** HTML content for the body (inline tags only) */
  messageHtml: string
  /** ISO date string */
  date: string
  severity: 'info' | 'warning' | 'breaking'
}

/**
 * Add new announcements at the TOP of this array.
 * Each entry needs a unique `id` that never changes once published.
 */
export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'oidc-login-2026-04',
    title: 'Login has changed',
    messageHtml:
      '<ol>' +
      '<li><strong>Home Assistant add-on:</strong> no changes — supervisor token and IP whitelist continue to handle access.</li>' +
      '<li><strong>Standalone with authentication:</strong> the built-in user/password login has been replaced by <strong>OIDC</strong> (OpenID Connect). Configure an OIDC provider via the <code>OIDC_*</code> environment variables.</li>' +
      '<li><strong>Standalone without authentication:</strong> if no <code>OIDC_*</code> variables are set, the server runs with open access (same behaviour as the old <code>noAuthentication</code> flag, which is no longer needed).</li>' +
      '</ol>',
    date: '2026-04-22',
    severity: 'info',
  },
]
