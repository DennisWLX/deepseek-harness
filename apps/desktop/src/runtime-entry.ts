/**
 * Desktop profile launcher for the Tauri sidecar. The process owns stdout as
 * the NDJSON control channel; ordinary application diagnostics are expected
 * on stderr and non-JSON stdout lines are ignored by the Rust supervisor.
 * @module dsh-desktop-runtime
 */

import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import {
  boot,
  installFailLoud,
  loadLayeredEnv,
  loadOptionalPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  watchUserPatches,
  type Profile,
} from '@deepseek-ai/dsh-app-boot'
import {
  DSH_LAUNCH_ENVIRONMENT_KEY,
} from '@deepseek-ai/dsh-launch-environment'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  DESKTOP_ACCESS_TOKEN_ENV,
  readDesktopAccessToken,
} from '@deepseek-ai/dsh-client-connection'
import { Context, FiberState } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  controlErrorMessage,
  parseControlCommand,
  writeControlEvent,
  type ControlOutput,
} from './protocol.ts'

/** Diagnostics prefix used by app-boot and the sidecar supervisor. */
const RUNTIME_NAME = 'dsh-desktop-runtime'

/** Absolute path of this package manifest in both source, built, and pkg layouts. */
const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

/** Telemetry row disabled by the same user-facing opt-out as other surfaces. */
const TELEMETRY_ROW_ID = 'session-telemetry-otel'

/** Empty profile root, rewritten before every sidecar launch. */
const PROFILE_ROOT_CONFIG = `# dsh desktop profile root - patches compose the effective tree.
[]
`

/** Options accepted by the packaged sidecar. */
export interface RuntimeOptions {
  /** Launch token supplied by the Tauri process. */
  desktopToken?: string | undefined
  /** Profile name; desktop is the only shipped Tauri profile. */
  profile?: string | undefined
  /** Help request, printed to stderr because stdout is protocol-owned. */
  help?: boolean | undefined
}

/** Startup ownership passed through app-boot preparation and shutdown. */
interface RuntimeState {
  current?: Context
  output: ControlOutput
  exiting: boolean
  dispose: () => Promise<void>
  exitCode: number
}

/** Profile layers including both user-level patch files. */
interface ComposedProfile {
  profile: Profile
  patches: PatchOptions[]
  live: () => PatchOptions[]
}

/** Compose fresh user layers for one HMR generation. */
type LiveComposition = () => PatchOptions[]

/**
 * Parse sidecar arguments. The token is never written to stdout or included in
 * a fatal diagnostic.
 * @param argv - process arguments after the executable.
 * @returns validated options.
 */
function parseRuntimeArgs(argv: readonly string[]): RuntimeOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      'desktop-token': { type: 'string' },
      'profile': { type: 'string', default: 'desktop' },
      'help': { type: 'boolean', default: false },
    },
    strict: true,
  })
  return {
    desktopToken: values['desktop-token'],
    profile: values.profile,
    help: values.help,
  }
}

/** Print sidecar usage to stderr; stdout remains exclusively NDJSON. */
function printUsage(): void {
  process.stderr.write([
    `Usage: ${RUNTIME_NAME} --desktop-token <43-character-base64url-token> [--profile desktop]`,
    '',
    '  --desktop-token  per-launch HTTP/WebSocket access token',
    '  --profile        profile to boot (default: desktop)',
    '',
  ].join('\n'))
}

/** Resolve the user-level patch path under the shared Harness home. */
function homePatchPath(): string {
  return join(resolveDshHome(), PROFILE_PATCH_FILENAME)
}

/** Mirror the CLI's non-empty telemetry opt-out for the desktop profile. */
function telemetryPatch(hasRow: boolean): PatchOptions | undefined {
  if ((process.env.DSH_TELEMETRY_DISABLED ?? '') === '' || !hasRow) return undefined
  return { id: TELEMETRY_ROW_ID, disabled: true }
}

/**
 * Load and compose the shipped desktop profile plus both user patch layers.
 * Relative plugin paths continue to resolve beside the profile config.
 * @param profileName - profile to boot.
 * @returns resolved profile and its immutable/live patch lists.
 */
function composeProfile(profileName: string): ComposedProfile {
  const profile = loadProfile(RUNTIME_NAME, profileName, INSTALL_ANCHOR)
  const profilePatches = profile.patches
  const homePatches = loadOptionalPatches(RUNTIME_NAME, homePatchPath()) ?? []
  const bundlePatches = profile.layers.flatMap(layer => layer.patches)
  const basePatches = [...bundlePatches, ...profilePatches, ...homePatches]
  const rows = new Set<string>()
  for (const patch of basePatches) {
    if (patch.id !== undefined) rows.add(patch.id)
  }
  const overlay = telemetryPatch(rows.has(TELEMETRY_ROW_ID))
  const patches = [...basePatches, ...(overlay === undefined ? [] : [overlay])]
  return {
    profile,
    patches,
    live: () => structuredClone([
      ...bundlePatches,
      ...loadOptionalPatches(RUNTIME_NAME, profile.patchPath) ?? [],
      ...loadOptionalPatches(RUNTIME_NAME, homePatchPath()) ?? [],
      ...(overlay === undefined ? [] : [overlay]),
    ]),
  }
}

/**
 * Start the desktop sidecar. The returned promise resolves only after the tree
 * is disposed and the requested exit code is applied.
 * @param args - parsed launch options.
 * @param output - control stream, defaulting to `process.stdout`.
 * @param io - optional injected process/IO surfaces for subprocess tests.
 * @returns resolved exit code.
 */
export async function runDesktopRuntime(
  args: RuntimeOptions = parseRuntimeArgs(process.argv.slice(2)),
  output: ControlOutput = process.stdout,
  io: {
    env?: NodeJS.ProcessEnv
    cwd?: string
    stdin?: NodeJS.ReadableStream
    exit?: (code: number) => void
  } = {},
): Promise<number> {
  if (args.help) {
    printUsage()
    return 0
  }
  const token = readDesktopAccessToken(args.desktopToken ?? io.env?.[DESKTOP_ACCESS_TOKEN_ENV])
  if (token === undefined) {
    process.stderr.write(`${RUNTIME_NAME}: --desktop-token is required\n`)
    writeControlEvent(output, { type: 'fatal', message: 'desktop access token is required' })
    return 1
  }
  const profileName = args.profile ?? 'desktop'
  if (!Object.hasOwn(PROFILE_TEMPLATES, profileName)) {
    process.stderr.write(`${RUNTIME_NAME}: unsupported desktop profile ${JSON.stringify(profileName)}\n`)
    writeControlEvent(output, { type: 'fatal', message: `unsupported desktop profile ${JSON.stringify(profileName)}` })
    return 1
  }

  process.env[DESKTOP_ACCESS_TOKEN_ENV] = token
  const environment = loadLayeredEnv(RUNTIME_NAME, io.cwd ?? process.cwd())
  const composed = composeProfile(profileName)
  const rootConfig = join(composed.profile.dir, 'cordis.yml')
  writeFileSync(rootConfig, PROFILE_ROOT_CONFIG)

  const state: RuntimeState = {
    output,
    exiting: false,
    exitCode: 0,
    dispose: async () => { await state.current?.fiber.dispose() },
  }
  const requestShutdown = (code: number): void => {
    if (state.exiting) return
    state.exiting = true
    state.exitCode = code
    writeControlEvent(state.output, { type: 'shutdown' })
    void state.dispose()
  }
  const exit = io.exit ?? ((code: number) => { process.exitCode = code })

  const uninstallFailLoud = installFailLoud(RUNTIME_NAME, process, async () => {
    writeControlEvent(state.output, {
      type: 'fatal',
      message: 'late unhandled plugin failure',
    })
    await state.current?.fiber.dispose()
  })
  const onSignal = (code: number) => (): void => { requestShutdown(code) }
  const onTerm = onSignal(0)
  const onInterrupt = onSignal(130)
  process.on('SIGTERM', onTerm)
  process.on('SIGINT', onInterrupt)

  try {
    const ctx = await boot(
      RUNTIME_NAME,
      rootConfig,
      structuredClone(composed.patches),
      (hostCtx) => {
        state.current = hostCtx
        hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
        provideCmdline(hostCtx, { args: [], exit: requestShutdown })
      },
      import.meta.url,
    )
    state.current = ctx
    await installDesktopPatchWatching(ctx, composed.profile.patchPath, composed.live)
    if (state.exiting) {
      await new Promise<void>(resolve => setImmediate(resolve))
      return state.exitCode
    }
    const server = ctx.get('webServer')
    if (server === undefined || server.port === 0) {
      throw new Error(`${RUNTIME_NAME}: web server did not bind a desktop port`)
    }
    writeControlEvent(state.output, {
      type: 'ready',
      url: `http://127.0.0.1:${String(server.port)}`,
    })
    const stdin = io.stdin ?? process.stdin
    stdin.resume()
    const lines = createInterface({ input: stdin, crlfDelay: Infinity })
    lines.on('line', (line) => {
      if (parseControlCommand(line) !== undefined) requestShutdown(0)
    })
    lines.on('close', () => { requestShutdown(0) })
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (state.exiting) {
          clearInterval(timer)
          resolve()
        }
      }, 20)
      timer.unref()
    })
  } catch (error) {
    if (!state.exiting) {
      const message = controlErrorMessage(error)
      process.stderr.write(`${RUNTIME_NAME}: ${message}\n`)
      writeControlEvent(state.output, { type: 'fatal', message })
      state.exitCode = 1
      try {
        await state.current?.fiber.dispose()
      } catch {
        // The original fatal diagnostic remains the process result.
      }
    }
  } finally {
    process.off('SIGTERM', onTerm)
    process.off('SIGINT', onInterrupt)
    uninstallFailLoud()
    exit(state.exitCode)
  }
  return state.exitCode
}

/**
 * Install live profile/home patch watching with the same minimal HMR fallback
 * used by the CLI. A failure only suppresses setup when shutdown is already
 * in progress.
 * @param ctx - settled desktop root.
 * @param compose - fresh patch composition per HMR generation.
 */
async function installDesktopPatchWatching(
  ctx: Context,
  profilePatchPath: string,
  compose: LiveComposition,
): Promise<void> {
  if (ctx.get('loader') === undefined || ctx.fiber.state !== FiberState.ACTIVE) return
  if (ctx.get('hmr') === undefined) {
    if (ctx.get('timer') === undefined) await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-timer' })
    await ctx.loader.create({
      name: '@deepseek-ai/cordis-plugin-hmr',
      config: { base: dirname(profilePatchPath), root: [] },
    })
  }
  await watchUserPatches(ctx, { binName: RUNTIME_NAME, filename: profilePatchPath, compose })
  await watchUserPatches(ctx, { binName: RUNTIME_NAME, filename: homePatchPath(), compose })
}
