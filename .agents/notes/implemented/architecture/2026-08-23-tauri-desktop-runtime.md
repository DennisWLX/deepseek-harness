# Agent Note: Tauri desktop runtime

Status: implemented

English | [中文](2026-08-23-tauri-desktop-runtime.zh.md)

## Problem

DeepSeek Harness ships a Web application backed by a Node process, but has no native desktop application. A desktop surface must reuse the existing Web GUI, preserve the installed profile and user patch layers, and keep the runtime's plugin and package set closed without embedding a package manager in the desktop application.

## Decision

### Native shell and sidecar split

The desktop application is a Tauri shell with a Node sidecar. Tauri owns window creation, navigation, external links, and process lifecycle. The sidecar is the existing profile runtime packaged with `@yao-pkg/pkg --sea` and exposes a dynamic loopback HTTP server. The shell opens the Web GUI at the sidecar URL only after receiving its NDJSON `ready` event; `fatal` and `shutdown` complete the control protocol. Tauri launches the sidecar with the workspace directory as its current directory and logs sidecar stdout/stderr to the application log directory.

The sidecar runs the `desktop` profile: `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, and `@deepseek-ai/dsh-desktop-app`. The desktop bundle pins the webserver to `127.0.0.1`, disables Web browser handoff, and replaces the Web surface prompt with the native-shell surface prompt. Profile and home `cordis.patch.yml` layers remain on the user's disk and are hot reloaded. Relative local plugin paths continue to resolve from the profile configuration directory; bare package names resolve from the packaged sidecar's node_modules tree. `client-modules` and `typert-loader` use the Loader root context as the bare-package manifest anchor and the config-tree context for relative specifiers. The desktop application does not run `pnpm` or install packages at runtime.

### Transport authentication

Each launch generates a 32-byte random token encoded as 43 base64url characters. HTTP requests carry `Authorization: Bearer <token>`; WebSocket upgrades carry the dedicated `dsh-desktop-token.<token>` subprotocol because browser WebSocket constructors cannot set request headers. The connection plugin rejects every `/api` HTTP request and WebSocket upgrade without a valid token. The token is injected into the page global by Tauri, never into the served HTML.

### Packaging

`scripts/build-desktop-sidecar.ts` materializes the production workspace closure under `apps/desktop/.sidecar-runtime`, emits one SEA executable per macOS architecture, and copies the executable into the Tauri external-bin directory. The staging step also copies `node-pty`'s spawn helper and the target-native ripgrep sidecar beside the executable. The packaged tree includes all JavaScript, package manifests, native `.node` files, and the macOS libvips `.dylib` needed by the Web app's image attachment path. The Tauri configuration keeps the sidecar in the application bundle and reserves platform extension points while macOS is the first shipped target.

## Testing

Host and browser connection tests cover bearer parsing, constant-time comparison, WebSocket subprotocol parsing, and the client token attachment. Runtime tests cover the desktop bundle and control protocol. Regression tests for both manifest scanners place a resolvable runtime root beside an empty profile root and verify that bare packages compose or register. A built macOS sidecar smoke starts with a 43-character token, reports `ready`, accepts authenticated HTTP and WebSocket connections, and exits 0 after `shutdown`. Its HTML assertion requires a nonempty `__DSH_BOOT__` graph and the modules/runtime parser preloads. The Tauri `.app` build launches the managed state, receives the sidecar `ready` event in its application log, and closes without stderr.

## Alternatives considered

**Embedding JavaScript directly in Tauri.** Rejected because the existing Web GUI depends on a Node backend and the Web server; a second browser-only shell would not preserve the Web application behavior.

**Using Electron.** Rejected because the desktop application needs only a small native shell and the existing Node runtime already owns the backend; Tauri keeps that boundary explicit and the packaged runtime independent.

**Allowing the desktop runtime to install packages with pnpm.** Rejected because it makes user profile edits able to mutate the application's runtime dependency graph, breaks reproducibility, and broadens the desktop attack surface. The profile layer remains user-owned through the existing profile mechanism.

**Exposing a fixed port or putting the token in the served HTML.** Rejected because a dynamic loopback port and a per-launch token reduce cross-launch and local-network exposure, and the browser WebSocket API needs the token in a place it can send without request headers.

## Consequences

The desktop application reuses the Web GUI and existing Cordis composition, while the native shell remains responsible only for OS integration and lifecycle. The SEA sidecar is a larger native artifact and depends on pkg's VFS module hooks; package updates and platform support require rebuilding the sidecar. macOS builds must stage sharp's libvips and native sidecars explicitly. The sidecar remains a closed runtime, but user profile layers and relative local plugins stay editable without modifying the application bundle.
