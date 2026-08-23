#!/usr/bin/env node
/**
 * Packaged desktop runtime entry. Importing this module starts the process
 * because the pkg manifest uses it as the executable bin.
 * @module dsh-desktop-runtime/bin
 */

import { runDesktopRuntime } from './runtime-entry.ts'

await runDesktopRuntime()
