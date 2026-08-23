# Agent Note: Desktop deploy uses an isolated workspace

Status: implemented

English | [中文](2026-08-23-desktop-deploy-ignore-scripts.zh.md)

## Problem

The desktop sidecar builder ran `pnpm deploy --prod --ignore-scripts` from the repository root. pnpm's legacy deploy path still executed the repository-root postinstall, which imports the development-only Lefthook package omitted by production deploy, so packaging failed before Tauri compilation. A root production deploy could also rewrite `node_modules/.modules.yaml` into production-only mode, causing later local installs to omit development dependencies.

## Decision

`scripts/build-desktop-sidecar.ts` copies the repository source needed for packaging into a disposable temporary workspace. It runs the existing legacy `pnpm deploy` command from that workspace with `npm_config_ignore_scripts=true`, materializes the staged workspace links before deleting the copy, and keeps the deploy target under the real repository.

The temporary copy excludes dependency trees, Git metadata, desktop bundles, Tauri build output, and environment files. The `--ignore-scripts` CLI flag remains because it describes the intent for pnpm implementations that honor it; the environment value suppresses the workspace-root lifecycle in legacy deploy mode.

## Alternatives considered

**Run legacy deploy from the repository root and suppress only lifecycle scripts.** Rejected because it can rewrite the checked-out `node_modules/.modules.yaml` into production-only mode, breaking subsequent local installs.

**Use non-legacy `pnpm deploy`.** Rejected because the desktop closure contains non-injected workspace packages; pnpm fails with `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`.

**Make the Lefthook installer tolerate a missing dependency.** Rejected because a production deploy must not run development Git-hook setup at all. Import-time resilience would preserve the unintended postinstall execution and hide other development-only lifecycle failures.

**Move Lefthook into the root production dependencies.** Rejected because it would add a Git-hook tool and its platform binaries to the packaged runtime closure.

**Remove the repository-root postinstall.** Rejected because it is the intended setup path for local checkouts.

## Consequences

Production desktop deploy installs only the runtime dependency closure in a disposable workspace and cannot alter the checked-out `node_modules` state. Local `pnpm install` still runs the Lefthook postinstall normally. The cost is one source-tree copy per deploy; the temporary workspace is removed on success and failure.

## Testing

A real macOS x64 run of `pnpm exec tsx scripts/build-desktop-sidecar.ts --skip-build --targets=node24-macos-x64` completed and produced the Tauri sidecar. The SHA-256 hash of `node_modules/.modules.yaml` was unchanged before and after the run, and no `dsh-desktop-deploy-*` temporary workspace remained.
