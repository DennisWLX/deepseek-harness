/** Desktop bundle runtime glue: the startup provider and native-surface prompt. */

import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, inject } from '../src/index.ts'
import { apply as applyStartup, DESKTOP_RUNTIME_SERVICE, inject as startupInject } from '../src/startup.ts'

const TOKEN = 'D'.repeat(43)
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function fakeServer(port: number): WebServer {
  return { port } as WebServer
}

describe('desktop-app surface', () => {
  it('registers the desktop surface text at the actual loopback URL', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('webServer', fakeServer(54321))
    await ctx.plugin(SystemPrompt, { persona: '' })
    const fiber = ctx.plugin({ apply, inject })
    await fiber.await()
    const assembly = await ctx.systemPrompt.assemble()
    const section = assembly.sections.find(entry => entry.name === 'app:web-surface')
    expect(section?.text).toContain('DeepSeek Harness desktop application')
    expect(section?.text).toContain('http://127.0.0.1:54321')
    expect(section?.text).toContain('Do not describe the application as running in a browser')
  })
})

describe('desktop startup provider', () => {
  it('publishes the validated token and fixed dynamic loopback bind', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('cmdlineArgs', {})
    const fiber = ctx.plugin({ apply: applyStartup, inject: startupInject }, { accessToken: TOKEN })
    await fiber.await()
    expect(ctx.get(DESKTOP_RUNTIME_SERVICE)).toEqual({
      accessToken: TOKEN,
      host: '127.0.0.1',
      port: 0,
    })
  })

  it('fails loud for a malformed inherited token', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('cmdlineArgs', {})
    const fiber = ctx.plugin(
      { apply: applyStartup, inject: startupInject },
      { accessToken: 'short' },
    )
    await expect(fiber.await()).rejects.toThrow(/43-character base64url/)
  })
})
