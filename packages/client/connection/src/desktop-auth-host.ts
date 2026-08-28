/** Host-side desktop transport comparisons, kept separate from browser bundles. */

import { timingSafeEqual } from 'node:crypto'
import {
  parseDesktopBearer,
  parseDesktopWebSocketProtocol,
} from './desktop-auth.ts'

type TransportHeaders = Headers | Readonly<Record<string, string | readonly string[] | undefined>>

function headerValue(headers: TransportHeaders, name: string): string | readonly string[] | undefined {
  return headers instanceof Headers ? headers.get(name) ?? undefined : headers[name]
}

/**
 * Compare a submitted bearer token without leaking valid-token length through
 * ordinary string comparison.
 * @param headers - request headers containing an optional authorization value.
 * @param expected - validated configured token.
 * @returns true for one exact bearer match.
 */
export function isDesktopHttpAuthorized(
  headers: TransportHeaders,
  expected: string,
): boolean {
  return secureTokenEqual(parseDesktopBearer(headerValue(headers, 'authorization')), expected)
}

/**
 * Compare a submitted WebSocket subprotocol.
 * @param headers - upgrade request headers containing the subprotocol header.
 * @param expected - validated configured token.
 * @returns true for one exact subprotocol match.
 */
export function isDesktopWebSocketAuthorized(
  headers: TransportHeaders,
  expected: string,
): boolean {
  return secureTokenEqual(
    parseDesktopWebSocketProtocol(headerValue(headers, 'sec-websocket-protocol')),
    expected,
  )
}

/** Length-checked constant-time comparison. */
function secureTokenEqual(submitted: string | undefined, expected: string): boolean {
  if (submitted === undefined || submitted.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(submitted), Buffer.from(expected))
}
