/**
 * Desktop transport authentication: exact bearer and WebSocket subprotocol
 * parsing plus the Host route fence.
 */

import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { WebRoute, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { isDesktopHttpAuthorized, isDesktopWebSocketAuthorized } from '../src/desktop-auth-host.ts'
import {
  desktopAuthorizationValue,
  desktopWebSocketProtocol,
  parseDesktopBearer,
  parseDesktopWebSocketProtocol,
  readDesktopAccessToken,
} from '../src/desktop-auth.ts'
import { API_PATH, apply, inject, type HostConnectionHandle } from '../src/index.ts'
import { provideBrowserCredentials } from './browser-credentials.ts'

const TOKEN = 'A'.repeat(43)
const OTHER = 'B'.repeat(43)

function httpHeaders(authorization?: string | string[]): { authorization?: string | string[] } {
  return authorization === undefined ? {} : { authorization }
}

function websocketHeaders(protocol?: string | string[]): { 'sec-websocket-protocol'?: string | string[] } {
  return protocol === undefined ? {} : { 'sec-websocket-protocol': protocol }
}

describe('desktop auth parsing', () => {
  it('accepts only the fixed 43-character base64url token', () => {
    expect(readDesktopAccessToken(TOKEN)).toBe(TOKEN)
    expect(() => readDesktopAccessToken('A'.repeat(42))).toThrow(/43-character base64url/)
    expect(() => readDesktopAccessToken('A'.repeat(44))).toThrow(/43-character base64url/)
    expect(() => readDesktopAccessToken('A'.repeat(42) + '!')).toThrow(/43-character base64url/)
  })

  it('parses exactly one bearer credential', () => {
    expect(parseDesktopBearer(desktopAuthorizationValue(TOKEN))).toBe(TOKEN)
    expect(parseDesktopBearer(`Basic ${TOKEN}`)).toBeUndefined()
    expect(parseDesktopBearer([`Bearer ${TOKEN}`, `Bearer ${OTHER}`])).toBeUndefined()
  })

  it('parses exactly one desktop WebSocket subprotocol', () => {
    expect(parseDesktopWebSocketProtocol(desktopWebSocketProtocol(TOKEN))).toBe(TOKEN)
    expect(parseDesktopWebSocketProtocol(`other, ${desktopWebSocketProtocol(TOKEN)}`)).toBeUndefined()
    expect(parseDesktopWebSocketProtocol([desktopWebSocketProtocol(TOKEN)])).toBeUndefined()
  })

  it('uses constant-time token comparisons at both transport boundaries', () => {
    expect(isDesktopHttpAuthorized(httpHeaders(desktopAuthorizationValue(TOKEN)), TOKEN)).toBe(true)
    expect(isDesktopHttpAuthorized(httpHeaders(desktopAuthorizationValue(OTHER)), TOKEN)).toBe(false)
    expect(isDesktopHttpAuthorized(httpHeaders(`Bearer ${TOKEN} `), TOKEN)).toBe(false)
    expect(isDesktopWebSocketAuthorized(websocketHeaders(desktopWebSocketProtocol(TOKEN)), TOKEN)).toBe(true)
    expect(isDesktopWebSocketAuthorized(websocketHeaders(desktopWebSocketProtocol(OTHER)), TOKEN)).toBe(false)
    expect(isDesktopWebSocketAuthorized(websocketHeaders(), TOKEN)).toBe(false)
  })
})

function fakeServer(routes: WebRoute[]): Pick<WebServer, 'register'> {
  return {
    register(route) {
      routes.push(route)
      return () => {}
    },
  }
}

function request(headers: Record<string, string>): IncomingMessage {
  const value = Readable.from([]) as unknown as IncomingMessage
  Object.assign(value, { url: `${API_PATH}/session.list`, method: 'GET', headers })
  return value
}

function response(): { response: ServerResponse; status: () => number | undefined; body: () => string } {
  const state: { status?: number; body?: string } = {}
  const chunks: Buffer[] = []
  const value = Object.assign(new EventEmitter(), {
    writableEnded: false,
    writeHead(status: number) {
      state.status = status
      return this
    },
    write(chunk: Buffer) {
      chunks.push(Buffer.from(chunk))
      return true
    },
    end(this: { writableEnded: boolean }, chunk?: string) {
      if (chunk !== undefined) chunks.push(Buffer.from(chunk))
      state.body = Buffer.concat(chunks).toString()
      this.writableEnded = true
      return this
    },
  }) as unknown as ServerResponse
  return {
    response: value,
    status: () => state.status,
    body: () => state.body ?? '',
  }
}

async function mount(token?: string): Promise<{
  routes: WebRoute[]
  connection: HostConnectionHandle
}> {
  const ctx = new Context()
  const routes: WebRoute[] = []
  provideBrowserCredentials(ctx)
  ctx.provide('webServer', fakeServer(routes) as WebServer)
  await ctx.plugin(
    { apply, inject: [...inject] },
    token === undefined ? undefined : { accessToken: token },
  )
  const connection = ctx.get('connection')
  if (connection === undefined) throw new Error('connection was not provided')
  return { routes, connection }
}

describe('connection desktop HTTP fence', () => {
  it('requires the configured bearer on every /api request', async () => {
    const { routes } = await mount(TOKEN)
    const denied = response()
    await routes[0]!.handler(request({
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
    }), denied.response)
    expect(denied.status()).toBe(403)

    const wrong = response()
    await routes[0]!.handler(request({
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
      authorization: desktopAuthorizationValue(OTHER),
    }), wrong.response)
    expect(wrong.status()).toBe(403)

    const accepted = response()
    await routes[0]!.handler(request({
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
      authorization: desktopAuthorizationValue(TOKEN),
    }), accepted.response)
    expect(accepted.status()).toBe(404)
  })

  it('requires the configured subprotocol on Connection-owned WebSocket checks', async () => {
    const { connection } = await mount(TOKEN)
    const headers = {
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
    }
    expect(connection.requestUpgradeRejection(request(headers))).toBe(403)
    expect(connection.requestUpgradeRejection(request({
      ...headers,
      'sec-websocket-protocol': desktopWebSocketProtocol(OTHER),
    }))).toBe(403)
    expect(connection.requestUpgradeRejection(request({
      ...headers,
      'sec-websocket-protocol': desktopWebSocketProtocol(TOKEN),
    }))).toBeUndefined()
  })

  it('lets the Tauri shell load the index without the Web cookie exchange', async () => {
    const { connection } = await mount(TOKEN)
    const response = { writeHead() {}, end() {} }
    expect(connection.authorizeIndex(request({ host: '127.0.0.1:3080' }), response)).toBe(true)
    expect(connection.authenticatedUrl('http://127.0.0.1:3080')).toBe('http://127.0.0.1:3080')
  })

  it('fails the plugin load for a malformed configured token', async () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    provideBrowserCredentials(ctx)
    ctx.provide('webServer', fakeServer(routes) as WebServer)
    await expect(ctx.plugin({ apply, inject: [...inject] }, { accessToken: 'short' }))
      .rejects.toThrow(/43-character base64url/)
    expect(routes).toHaveLength(0)
  })
})
