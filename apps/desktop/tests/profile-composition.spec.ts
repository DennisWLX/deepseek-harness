/** Desktop profile composition must mirror the CLI's shipped preset roots. */

import { describe, expect, it } from 'vitest'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import { withDesktopPresetRoot } from '../src/profile-composition.ts'

describe('desktop profile composition', () => {
  it('injects the shipped system preset root while preserving row config', () => {
    const composed = composeEntries([withDesktopPresetRoot([{
      insert: [{
        id: 'agent-presets',
        name: '@deepseek-ai/dsh-agent-presets',
        config: { default: 'standard' },
      }],
    }])])
    const row = composed.find(entry => entry.id === 'agent-presets')

    expect(row?.config).toMatchObject({
      default: 'standard',
      roots: [{ trust: 'system' }],
    })
    const roots = (row?.config as { roots?: Array<{ path: string }> } | undefined)?.roots
    expect(roots?.[0]?.path.endsWith('/config/agent-presets')).toBe(true)
  })

  it('does not add a preset overlay when the profile has no preset row', () => {
    const patches = [{
      insert: [{ id: 'other-row', name: '@deepseek-ai/example', config: {} }],
    }]

    expect(withDesktopPresetRoot(patches)).toEqual(patches)
  })
})
