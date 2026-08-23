import { defineConfig } from 'tsdown'

/**
 * The packaged sidecar publishes the self-executing bin and the protocol
 * module used by the Tauri process and runtime tests.
 */
export default defineConfig({
  entry: ['lib/types/bin.js', 'lib/types/protocol.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
