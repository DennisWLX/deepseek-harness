# Agent Note: Desktop packaging script

Status: implemented

English | [中文](2026-08-23-desktop-packaging-script.zh.md)

## Problem

Building the desktop application required a human to choose the sidecar architecture, add the active Rust toolchain to `PATH`, then run the Tauri command. A missing sidecar rebuild leaves stale Node artifacts in the `.app`, while a missing Rust `PATH` fails before the shell build starts.

## Decision

`apps/desktop/build-desktop.sh` is the executable macOS packaging entry. It derives the repository root from the script location, detects `x64` or `arm64` from `uname -m`, resolves the active `cargo` through `rustup which cargo`, prepends that toolchain directory to `PATH`, and validates Node and pnpm before building. The default path builds the current architecture's Node sidecar and the `.app`; `--dmg` also builds a DMG, `--skip-sidecar` targets Rust-only changes, and `--arch=x64|arm64` overrides architecture detection.

The script performs no repository cleanup. The existing sidecar builder owns staging removal and repository builds.

## Alternatives considered

**Add only an npm script.** Rejected because it would still expose the Rust toolchain and architecture-specific sidecar target to every caller and would not work as a directly executable shell entry.

**Add architecture detection to the TypeScript sidecar builder and a separate Tauri wrapper.** Rejected because the packaging decision spans two existing commands and the shell preflight is small. The sidecar builder remains the authority for staging, packing, and native-sidecar placement.

**Make the script support Windows and Linux.** Rejected because the current desktop bundle configuration ships macOS targets and the sidecar builder accepts macOS architectures only.

## Consequences

Developers can package the current macOS architecture with one command and get a clear failure before expensive work when a prerequisite is absent. Explicit cross-architecture or multi-target packaging still uses the underlying builder because the wrapper does not change Tauri target selection or the sidecar target grammar.

## Testing

The script passes `bash -n`, its help path returns zero, and its unsupported-architecture path returns nonzero before executing a build. The normal build path delegates to the existing sidecar builder and Tauri CLI, whose validation is covered by the desktop build and `tauri:check`.
