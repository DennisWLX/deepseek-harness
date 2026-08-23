/**
 * Desktop startup provider. The Tauri runtime validates and exports the
 * launch token before boot; this row turns that environment fact into the
 * ordinary service that the webserver and connection rows read.
 * @module @deepseek-ai/dsh-desktop-app/startup
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { readDesktopAccessToken } from '@deepseek-ai/dsh-client-connection'

/** Stable Cordis plugin name. */
export const name = 'desktop-startup'

/** Launcher-provided command-line snapshot is an existing boot fact. */
export const inject = ['cmdlineArgs']

/** Service provided by this row and consumed by patched desktop rows. */
export const DESKTOP_RUNTIME_SERVICE = 'desktopRuntime'

/** Desktop bind facts shared by the server and connection patches. */
export interface DesktopRuntimeValues {
  /** Launch token shared by HTTP and WebSocket channels. */
  accessToken: string
  /** Mandatory loopback bind address. */
  host: '127.0.0.1'
  /** Dynamic-port request; the webserver reports the selected port. */
  port: 0
}

/** Startup config resolved from the launcher environment. */
export interface Config {
  /** Raw launch token; validated before the service is published. */
  accessToken: string
}

export const Config: z<Config> = z.object({
  accessToken: z.string().required(),
})

/**
 * Validate the inherited desktop token and publish the fixed desktop runtime.
 * @param ctx - plugin context carrying the launcher's command-line snapshot.
 * @param config - raw startup config.
 */
export function apply(ctx: Context, config: Config): void {
  const accessToken = readDesktopAccessToken(config.accessToken)
  if (accessToken === undefined) {
    throw new Error('desktop-startup: DSH_DESKTOP_ACCESS_TOKEN is required')
  }
  ctx.provide(DESKTOP_RUNTIME_SERVICE, {
    accessToken,
    host: '127.0.0.1',
    port: 0,
  } satisfies DesktopRuntimeValues)
}
