/** Host-side desktop transport comparisons, kept separate from browser bundles. */

import { timingSafeEqual } from 'node:crypto'
import {
  parseDesktopBearer,
  parseDesktopWebSocketProtocol,
} from './desktop-auth.ts'

/**
 * Compare a submitted bearer token without leaking valid-token length through
 * ordinary string comparison.
 * @param headers - request headers containing an optional authorization value.
 * @param expected - validated configured token.
 * @returns true for one exact bearer match.
 */
export function isDesktopHttpAuthorized(
  headers: { authorization?: string | string[] | undefined },
  expected: string,
): boolean {
  return secureTokenEqual(parseDesktopBearer(headers.authorization), expected)
}

/**
 * Compare a submitted WebSocket subprotocol.
 * @param headers - upgrade request headers containing the subprotocol header.
 * @param expected - validated configured token.
 * @returns true for one exact subprotocol match.
 */
export function isDesktopWebSocketAuthorized(
  headers: { 'sec-websocket-protocol'?: string | string[] | undefined },
  expected: string,
): boolean {
  return secureTokenEqual(parseDesktopWebSocketProtocol(headers['sec-websocket-protocol']), expected)
}

/** Length-checked constant-time comparison. */
function secureTokenEqual(submitted: string | undefined, expected: string): boolean {
  if (submitted === undefined || submitted.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(submitted), Buffer.from(expected))
}
