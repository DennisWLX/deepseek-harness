/**
 * Desktop-only profile composition shared with the runtime entry. The CLI's
 * profile boot injects the shipped preset root because the CLI package owns
 * `config/agent-presets`; the desktop sidecar resolves the same directory
 * through its installed `@deepseek-ai/dsh` dependency.
 */

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

const AGENT_PRESETS_ROW_ID = 'agent-presets'
const requireFromHere = createRequire(import.meta.url)

function shippedPresetRoot(): string {
  const manifestPath = requireFromHere.resolve('@deepseek-ai/dsh/package.json')
  return join(dirname(manifestPath), 'config', 'agent-presets')
}

/**
 * Append the shipped system preset root to a desktop patch composition.
 * The installed `@deepseek-ai/dsh` package carries the same preset directory
 * the CLI profile boot resolves from its own package.
 * @param patches - the patch layers that may contain an `agent-presets` row.
 * @returns the original patches plus the desktop system-root overlay.
 */
export function withDesktopPresetRoot(patches: readonly PatchOptions[]): PatchOptions[] {
  const row = composeEntries([[...patches]]).find(entry => entry.id === AGENT_PRESETS_ROW_ID)
  if (row === undefined) return [...patches]
  return [...patches, {
    id: AGENT_PRESETS_ROW_ID,
    config: {
      ...(row.config as Record<string, unknown> | undefined ?? {}),
      roots: [{ path: shippedPresetRoot(), trust: 'system' }],
    },
  }]
}
