/**
 * Build the packaged Node sidecar for the Tauri desktop application. The
 * deploy and SEA strategy follows the Python SDK runtime builder; this copy
 * owns the desktop-only entry, target names, and Tauri sidecar layout.
 */

import { spawn } from 'node:child_process'
import { existsSync, globSync, readFileSync, statSync } from 'node:fs'
import {
  chmod,
  copyFile,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'

const root = resolve(import.meta.dirname, '..')
const DEPLOY_ROOT_PACKAGE = '@deepseek-ai/dsh-desktop-runtime'
const DEPLOY_DIR = 'apps/desktop/.sidecar-runtime'
const OUT_DIR = 'apps/desktop/dist-desktop'
const TAURI_BIN_DIR = 'apps/desktop/src-tauri/binaries'
const PKG_SPEC = '@yao-pkg/pkg@6.21.0'
const DEFAULT_NODE_RANGE = 'node24'

const ASSET_GLOBS = [
  'package.json',
  'node_modules/**/*.js',
  'node_modules/**/*.cjs',
  'node_modules/**/*.mjs',
  'node_modules/**/package.json',
  'node_modules/**/*.json',
  'node_modules/**/*.html',
  'node_modules/**/*.css',
  'node_modules/**/*.yml',
  'node_modules/**/*.yaml',
  'node_modules/**/*.svg',
  'node_modules/**/*.png',
  'node_modules/**/*.ico',
  'node_modules/**/*.woff',
  'node_modules/**/*.woff2',
  'node_modules/**/*.ttf',
  'node_modules/**/*.node',
  'node_modules/**/*.dylib',
  'node_modules/**/*.wasm',
]

interface Target {
  nodeRange: string
  arch: 'x64' | 'arm64'
}

function parseTarget(value: string): Target {
  const parts = value.split('-')
  if (parts.length !== 3 || parts[0] !== DEFAULT_NODE_RANGE || parts[1] !== 'macos') {
    throw new Error(`build-desktop-sidecar: target ${JSON.stringify(value)} must look like node24-macos-x64 or node24-macos-arm64`)
  }
  const arch = parts[2]
  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error(`build-desktop-sidecar: unsupported macOS arch ${JSON.stringify(arch)}`)
  }
  return { nodeRange: DEFAULT_NODE_RANGE, arch }
}

interface Cli {
  targets: Target[]
  skipBuild: boolean
  dryRun: boolean
}

function parseCli(argv: string[]): Cli {
  const { values } = parseArgs({
    args: argv,
    options: {
      'targets': { type: 'string' },
      'skip-build': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'help': { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    console.log([
      'Usage: pnpm exec tsx scripts/build-desktop-sidecar.ts [flags]',
      '',
      '  --targets=<t1,t2>  node24-macos-x64,node24-macos-arm64 (default: both)',
      '  --skip-build        skip the repository build',
      '  --dry-run           print commands and file operations',
      '',
    ].join('\n'))
    process.exit(0)
  }
  const targets = values.targets === undefined
    ? ['node24-macos-x64', 'node24-macos-arm64']
    : values.targets.split(',').map(part => part.trim()).filter(part => part !== '')
  const parsed = targets.map(parseTarget)
  if (parsed.length === 0) throw new Error('build-desktop-sidecar: --targets is empty')
  return { targets: parsed, skipBuild: values['skip-build'], dryRun: values['dry-run'] }
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(part => part.includes(' ') ? JSON.stringify(part) : part).join(' ')
}

class DesktopSidecarBuild {
  readonly staging = resolve(root, DEPLOY_DIR)
  readonly outDir = resolve(root, OUT_DIR)
  readonly binaryDir = resolve(root, TAURI_BIN_DIR)
  private workspaceSources = new Map<string, string>()

  constructor(private readonly cli: Cli) {}

  async buildRepository(): Promise<void> {
    if (this.cli.skipBuild) {
      console.log('build-desktop-sidecar: skipping pnpm run build (--skip-build)')
      return
    }
    await this.run('build', 'pnpm', ['run', 'build'])
  }

  async deployStaging(): Promise<void> {
    this.workspaceSources = this.discoverWorkspaceSources()
    if (this.staging === root || root.startsWith(this.staging + sep)) {
      throw new Error(`build-desktop-sidecar: refusing to clear staging dir ${this.staging}`)
    }
    if (this.cli.dryRun) console.log(`build-desktop-sidecar: [dry-run] rm -rf ${this.staging}`)
    else await rm(this.staging, { recursive: true, force: true })
    await this.run('deploy', 'pnpm', [
      '--filter', DEPLOY_ROOT_PACKAGE, 'deploy', '--legacy', '--prod',
      '--config.node-linker=hoisted',
      '--config.auto-install-peers=true',
      '--config.link-workspace-packages=true',
      '--ignore-scripts',
      this.staging,
    ])
    await this.restoreWorkspaceClosure()
    await this.materializeStagedLinks()
  }

  async injectPkgConfig(): Promise<void> {
    const manifestPath = join(this.staging, 'package.json')
    if (this.cli.dryRun) {
      console.log(`build-desktop-sidecar: [dry-run] patch ${manifestPath}`)
      return
    }
    if (!existsSync(manifestPath)) {
      throw new Error(`build-desktop-sidecar: ${manifestPath} missing after pnpm deploy`)
    }
    if (!existsSync(join(this.staging, 'lib', 'bin.js'))) {
      throw new Error('build-desktop-sidecar: apps/desktop/lib/bin.js missing; run without --skip-build first')
    }
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    const next = {
      ...manifest,
      bin: 'lib/bin.js',
      pkg: { assets: ASSET_GLOBS },
    }
    await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
  }

  async pack(target: Target): Promise<void> {
    const product = join(this.outDir, `dsh-desktop-runtime-macos-${target.arch}`)
    await mkdir(this.outDir, { recursive: true })
    await this.prepareSharpNative(target)
    await this.run(`pkg ${target.nodeRange}-macos-${target.arch}`, 'pnpm', [
      'dlx', PKG_SPEC, this.staging, '--sea', '--targets',
      `${target.nodeRange}-macos-${target.arch}`, '--output', product,
    ])
    if (!this.cli.dryRun && !existsSync(product)) {
      throw new Error(`build-desktop-sidecar: product ${product} missing after pkg`)
    }
    await this.copyNativeSidecars(target, product)
    await this.copyToTauri(target, product)
  }

  /**
   * Make pkg's native-addon extraction carry libvips beside sharp's binding.
   * pkg copies the package directory containing a `.node` file into its native
   * cache. Copying the target dylib into that same directory and retargeting
   * the binding to `@loader_path` preserves that extraction behavior.
   */
  private async prepareSharpNative(target: Target): Promise<void> {
    const sharpPackage = join(this.staging, 'node_modules', '@img', `sharp-darwin-${target.arch}`)
    const libvipsPackage = join(this.staging, 'node_modules', '@img', `sharp-libvips-darwin-${target.arch}`)
    if (this.cli.dryRun) {
      console.log(`build-desktop-sidecar: [dry-run] copy ${libvipsPackage}/lib/*.dylib into ${sharpPackage}/lib/`)
      console.log('build-desktop-sidecar: [dry-run] retarget sharp bindings to @loader_path')
      return
    }
    const bindingCandidates = globSync('lib/*.node', { cwd: sharpPackage })
    if (bindingCandidates.length !== 1) {
      throw new Error(`build-desktop-sidecar: expected one sharp binding in ${sharpPackage}`)
    }
    const binding = bindingCandidates[0]
    if (binding === undefined) {
      throw new Error(`build-desktop-sidecar: expected one sharp binding in ${sharpPackage}`)
    }
    const bindingPath = join(sharpPackage, binding)
    const dylibCandidates = globSync('lib/*.dylib', { cwd: libvipsPackage })
    if (dylibCandidates.length === 0) {
      throw new Error(`build-desktop-sidecar: sharp libvips dylib missing in ${libvipsPackage}`)
    }
    for (const relative of dylibCandidates) {
      const source = join(libvipsPackage, relative)
      const destination = join(dirname(bindingPath), basename(relative))
      await copyFile(source, destination)
      await this.run(
        `sharp native ${target.arch}`,
        'install_name_tool',
        [
          '-change',
          `@rpath/${basename(relative)}`,
          `@loader_path/${basename(relative)}`,
          bindingPath,
        ],
      )
    }
  }

  private async copyNativeSidecars(target: Target, product: string): Promise<void> {
    const names = [
      ['spawn-helper', join(this.staging, 'node_modules', 'node-pty', 'prebuilds', `darwin-${target.arch}`, 'spawn-helper')],
      ['rg', join(this.staging, 'node_modules', '@vscode', `ripgrep-darwin-${target.arch}`, 'bin', 'rg')],
    ] as const
    for (const [suffix, source] of names) {
      const destination = `${product}-${suffix}`
      if (this.cli.dryRun) {
        console.log(`build-desktop-sidecar: [dry-run] cp ${source} ${destination}`)
        continue
      }
      if (!existsSync(source)) {
        throw new Error(`build-desktop-sidecar: native sidecar missing at ${source}`)
      }
      await copyFile(source, destination)
      await chmod(destination, 0o755)
    }
  }

  private async copyToTauri(target: Target, product: string): Promise<void> {
    await mkdir(this.binaryDir, { recursive: true })
    const targetName = target.arch === 'x64' ? 'x86_64-apple-darwin' : 'aarch64-apple-darwin'
    const executable = join(this.binaryDir, `dsh-desktop-runtime-${targetName}`)
    const spawnHelper = join(this.binaryDir, 'dsh-desktop-runtime-spawn-helper')
    const ripgrep = join(this.binaryDir, 'dsh-desktop-runtime-rg')
    if (this.cli.dryRun) {
      console.log(`build-desktop-sidecar: [dry-run] cp ${product} ${executable}`)
      console.log(`build-desktop-sidecar: [dry-run] cp ${product}-spawn-helper ${spawnHelper}`)
      console.log(`build-desktop-sidecar: [dry-run] cp ${product}-rg ${ripgrep}`)
      return
    }
    await copyFile(product, executable)
    await copyFile(`${product}-spawn-helper`, spawnHelper)
    await copyFile(`${product}-rg`, ripgrep)
    await chmod(executable, 0o755)
    await chmod(spawnHelper, 0o755)
    await chmod(ripgrep, 0o755)
  }

  private async materializeStagedLinks(): Promise<void> {
    if (this.cli.dryRun) {
      console.log('build-desktop-sidecar: [dry-run] materialize staged package links')
      return
    }
    const nodeModules = join(this.staging, 'node_modules')
    let remaining = await this.findSymlink(nodeModules)
    while (remaining !== undefined) {
      const segments = remaining.slice(nodeModules.length + 1).split(sep)
      const binIndex = segments.lastIndexOf('.bin')
      if (binIndex >= 0) {
        await rm(join(nodeModules, ...segments.slice(0, binIndex + 1)), { recursive: true, force: true })
        remaining = await this.findSymlink(nodeModules)
        continue
      }
      const destination = remaining
      const source = await realpath(destination)
      const nestedNodeModules = join(source, 'node_modules')
      await rm(destination, { recursive: true, force: true })
      await cp(source, destination, {
        recursive: true,
        dereference: true,
        filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
      })
      remaining = await this.findSymlink(nodeModules)
    }
  }

  /**
   * Legacy pnpm deploy omits workspace dependencies reached through another
   * workspace package's dependencies/peers. Copy the production closure from
   * the checked-out root so the packaged runtime has one flat Cordis graph.
   */
  private async restoreWorkspaceClosure(): Promise<void> {
    if (this.cli.dryRun) {
      console.log('build-desktop-sidecar: [dry-run] restore workspace dependency closure')
      return
    }
    const stagingModules = join(this.staging, 'node_modules')
    const sourceModules = join(root, 'node_modules')
    const queue: string[] = []
    const seen = new Set<string>()
    const enqueue = (name: string): void => {
      if (seen.has(name)) return
      seen.add(name)
      queue.push(name)
    }
    const manifest = JSON.parse(
      await readFile(join(this.staging, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> }
    for (const name of Object.keys(manifest.dependencies ?? {})) enqueue(name)
    while (queue.length > 0) {
      const name = queue.shift()
      if (name === undefined) continue
      const source = this.packageSource(name, sourceModules)
      if (source === undefined) continue
      const destination = join(stagingModules, name)
      if (existsSync(destination)) {
        const current = JSON.parse(
          await readFile(join(destination, 'package.json'), 'utf8'),
        ) as PackageManifest
        this.enqueueDependencies(current, enqueue)
        continue
      }
      await this.copyPackage(source, destination)
      const copied = JSON.parse(
        await readFile(join(destination, 'package.json'), 'utf8'),
      ) as PackageManifest
      this.enqueueDependencies(copied, enqueue)
    }
  }

  private packageSource(name: string, sourceModules: string): string | undefined {
    const workspace = this.workspaceSources.get(name)
    if (workspace !== undefined) return workspace
    const candidate = join(sourceModules, name)
    return existsSync(candidate) ? candidate : undefined
  }

  private discoverWorkspaceSources(): Map<string, string> {
    const result = new Map<string, string>()
    const patterns = [
      'vendor/*/package.json',
      'packages/*/*/package.json',
      'apps/*/package.json',
    ]
    for (const path of globSync(patterns, { cwd: root })) {
      const manifest = JSON.parse(
        readFileSync(join(root, path), 'utf8'),
      ) as { name?: string }
      if (typeof manifest.name === 'string') {
        result.set(manifest.name, dirname(join(root, path)))
      }
    }
    return result
  }

  private enqueueDependencies(
    manifest: PackageManifest,
    enqueue: (name: string) => void,
  ): void {
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ]
    for (const name of names) {
      if (name.startsWith('@deepseek-ai/')) enqueue(name)
    }
  }

  private async copyPackage(source: string, destination: string): Promise<void> {
    await mkdir(dirname(destination), { recursive: true })
    const nestedNodeModules = join(await realpath(source), 'node_modules')
    await cp(await realpath(source), destination, {
      recursive: true,
      dereference: true,
      filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
    })
  }

  private async findSymlink(directory: string): Promise<string | undefined> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if ((await lstat(path)).isSymbolicLink()) return path
      if (entry.isDirectory()) {
        const nested = await this.findSymlink(path)
        if (nested !== undefined) return nested
      }
    }
    return undefined
  }

  private async run(label: string, command: string, args: string[]): Promise<void> {
    const printable = formatCommand(command, args)
    if (this.cli.dryRun) {
      console.log(`build-desktop-sidecar: [dry-run] ${printable}`)
      return
    }
    console.log(`build-desktop-sidecar: ${label}: ${printable}`)
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(command, args, {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, CI: 'true' },
      })
      child.once('error', (error) => {
        reject(new Error(`build-desktop-sidecar: ${label} failed to spawn: ${error.message} (${printable})`))
      })
      child.once('exit', (code, signal) => {
        if (code === 0) resolvePromise()
        else reject(new Error(`build-desktop-sidecar: ${label} failed (${code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${code}`}): ${printable}`))
      })
    })
  }

  printProducts(targets: readonly Target[]): void {
    if (this.cli.dryRun) return
    for (const target of targets) {
      const product = join(this.outDir, `dsh-desktop-runtime-macos-${target.arch}`)
      console.log(`build-desktop-sidecar: ${product} (${(statSync(product).size / 1024 / 1024).toFixed(1)} MB)`)
    }
  }
}

interface PackageManifest {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

const cli = parseCli(process.argv.slice(2))
const build = new DesktopSidecarBuild(cli)
console.log(`build-desktop-sidecar: targets: ${cli.targets.map(target => `${target.nodeRange}-macos-${target.arch}`).join(', ')}`)
await build.buildRepository()
await build.deployStaging()
await build.injectPkgConfig()
for (const target of cli.targets) await build.pack(target)
build.printProducts(cli.targets)
