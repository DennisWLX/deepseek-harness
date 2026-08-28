/**
 * Packaged desktop runtime entry. Importing this module starts the sidecar;
 * the SEA staging manifest designates its compiled output during packaging.
 * @module dsh-desktop-runtime/bin
 */

import { runDesktopRuntime } from './runtime-entry.ts'

await runDesktopRuntime()
