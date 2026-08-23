# Agent Note: Settings developer-tools action

Status: implemented

English | [中文](2026-08-23-settings-developer-tools-action.zh.md)

## Problem

The desktop Web GUI is served by the Node sidecar over a loopback HTTP origin. Ordinary browser deployments must not render a Tauri-specific control, and the remote origin must not receive broad Tauri IPC access merely to open an inspector.

## Decision

The Tauri shell enables the `devtools` Cargo feature and registers the custom `open_devtools` command. `WebviewWindowBuilder` enables devtools and the initialization script injects `window.__DSH_DESKTOP_OPEN_DEVTOOLS__`, a function that invokes that command. The build script registers `open_devtools` and `show_log_path` in the app ACL manifest. The local capability grants `show_log_path`; a separate `desktop-devtools` capability grants only `open_devtools` to the `main` window from `http://127.0.0.1:*`. `ui-settings-general` registers a **Developer tools** row in the General section at order 30. The row renders only when the bridge function exists, invokes it through a promise-aware action, reports a localized failure, and becomes available again.

## Alternatives considered

**Call Tauri IPC from the General section without a Rust command.** Rejected because the current frontend has no `@tauri-apps/api` runtime and the browser plugin bundle must stay platform-neutral. A direct call to `__TAURI_INTERNALS__` would expose an internal implementation detail to application code.

**Grant `core:default` or all custom commands to the remote sidecar origin.** Rejected because the settings button needs only one command. The dedicated command permission keeps the loopback Web content from reaching the other Tauri IPC.

**Use the platform keyboard shortcut only.** Rejected because shortcuts vary by platform and provide no discoverable in-app action.

## Consequences

The release build carries Tauri's `devtools` feature, so the inspector can be opened from a packaged build. On macOS this relies on Tauri's private inspector API and is not suitable for App Store publication. Browser deployments render no row, and the remote origin receives only the narrowly scoped `open_devtools` command.

## Testing

`ui-settings-general` component tests cover hidden/visible rendering, bridge invocation, and rejection recovery. Its apply tests cover row registration and HMR/teardown. `cargo check` validates the Rust command and generated capability schemas. No assembled Tauri e2e lane exists, so the native inspector opening remains a manual desktop check.
