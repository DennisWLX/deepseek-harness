/**
 * Browser-safe desktop transport authentication contracts. The Host companion
 * in `desktop-auth-host.ts` performs the constant-time comparisons.
 */

/** Environment variable supplied to the desktop runtime by the Tauri shell. */
export const DESKTOP_ACCESS_TOKEN_ENV = 'DSH_DESKTOP_ACCESS_TOKEN'

/** Page global initialized by Tauri before the Web app loads. */
export const DESKTOP_ACCESS_TOKEN_GLOBAL = '__DSH_DESKTOP_ACCESS_TOKEN__'

/** Random 32-byte base64url token length, fixed by the Rust launcher. */
export const DESKTOP_ACCESS_TOKEN_LENGTH = 43

/** Prefix shared by the browser and Host WebSocket protocol parser. */
export const DESKTOP_WEBSOCKET_PROTOCOL_PREFIX = 'dsh-desktop-token.'

const DESKTOP_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]+)$/

/**
 * Validate and return a desktop token. The exact length and alphabet are part
 * of the launcher/runtime wire contract, so malformed inherited values fail
 * loud instead of becoming a weaker comparison.
 * @param value - raw environment value.
 * @returns the validated token.
 */
export function readDesktopAccessToken(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (!DESKTOP_ACCESS_TOKEN_PATTERN.test(value)) {
    throw new Error('desktop access token must be a 43-character base64url value')
  }
  return value
}

/**
 * Read the desktop token from the browser page global.
 * @returns the validated token, or `undefined` in a non-desktop page.
 */
export function desktopAccessTokenFromGlobal(): string | undefined {
  const global = globalThis as Record<string, unknown>
  const value = global[DESKTOP_ACCESS_TOKEN_GLOBAL]
  return readDesktopAccessToken(typeof value === 'string' ? value : undefined)
}

/**
 * Render the HTTP credential value.
 * @param token - validated desktop token.
 * @returns the complete `Authorization` header value.
 */
export function desktopAuthorizationValue(token: string): string {
  return `Bearer ${token}`
}

/**
 * Parse an exact bearer credential. Duplicate or malformed header values are
 * not interpreted as a partial grant.
 * @param value - raw authorization header.
 * @returns the bearer token, or `undefined` when the header is absent or does not match.
 */
export function parseDesktopBearer(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = BEARER_PATTERN.exec(value)
  return match?.[1]
}

/**
 * Render the dedicated browser WebSocket subprotocol for this launch.
 * @param token - validated desktop token.
 * @returns the subprotocol string.
 */
export function desktopWebSocketProtocol(token: string): string {
  return `${DESKTOP_WEBSOCKET_PROTOCOL_PREFIX}${token}`
}

/**
 * Parse the dedicated WebSocket subprotocol. Exactly one matching protocol is
 * accepted, so a proxy cannot smuggle a grant beside an unrelated protocol.
 * @param value - raw `sec-websocket-protocol` header.
 * @returns the validated token, or `undefined` when absent or malformed.
 */
export function parseDesktopWebSocketProtocol(
  value: string | readonly string[] | undefined,
): string | undefined {
  if (typeof value !== 'string') return undefined
  const protocols = value.split(',').map(part => part.trim()).filter(part => part !== '')
  if (protocols.length !== 1 || !protocols[0]?.startsWith(DESKTOP_WEBSOCKET_PROTOCOL_PREFIX)) {
    return undefined
  }
  return readDesktopAccessToken(protocols[0].slice(DESKTOP_WEBSOCKET_PROTOCOL_PREFIX.length))
}
