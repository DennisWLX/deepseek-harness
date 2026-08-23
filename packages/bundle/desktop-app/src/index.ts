/**
 * @deepseek-ai/dsh-desktop-app - desktop-surface glue for the Tauri shell.
 * The bundle patch composes the desktop startup provider, hardened loopback
 * transport, and this prompt plugin over the existing Web profile.
 * @module @deepseek-ai/dsh-desktop-app
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Stable Cordis plugin name. */
export const name = 'desktop-app'

/** The desktop prompt can render the actual loopback URL. */
export const inject = ['webServer', 'systemPrompt']

/** Prompt-section name owned by the desktop surface instead of the Web bundle. */
const SURFACE_SECTION = 'app:web-surface'

/** Model-visible orientation for a session hosted inside the native window. */
function desktopSurfacePrompt(url: string): string {
  return `You are interacting with the user through the DeepSeek Harness desktop application at ${url}. `
    + 'When the user refers to "this window", "this desktop app", or "this app" without naming another target, they mean this desktop application. '
    + 'The native shell provides the window and OS integration; the visible application surface is the existing DeepSeek Harness Web GUI. '
    + 'Do not describe the application as running in a browser or on a separate device. '
    + 'Starting another server does not update this window.'
}

/**
 * Mount the desktop-specific model-facing surface context. The Web bundle's
 * own `app:web-surface` contribution is disabled by the desktop patch, so this
 * is the sole section in that slot.
 * @param ctx - plugin context carrying the bound web server and prompt registry.
 */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: SURFACE_SECTION,
    order: -98,
    text: () => desktopSurfacePrompt(`http://127.0.0.1:${String(ctx.webServer.port)}`),
  })
}
