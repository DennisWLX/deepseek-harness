/** Desktop runtime startup against an isolated Harness home. */

import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { composeProfile } from '../src/runtime-entry.ts'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

describe('desktop runtime', () => {
  let home: string | undefined

  afterEach(async () => {
    vi.unstubAllEnvs()
    if (home !== undefined) await rm(home, { recursive: true, force: true })
  })

  it('heals profile module fallbacks while composing a fresh Harness home', async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-desktop-runtime-'))
    vi.stubEnv('DSH_HOME', home)
    await composeProfile('desktop')

    expect(await realpath(join(home, 'profiles/node_modules/@deepseek-ai/dsh-scope')))
      .toBe(await realpath(join(REPO_ROOT, 'packages/core/scope')))
  })
})
