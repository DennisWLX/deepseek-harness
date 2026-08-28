# Desktop application

English | [中文](README.zh.md)

The Tauri desktop application for DeepSeek Harness. The repository code here is the deploy manifest for the packaged Node sidecar, the NDJSON control protocol, and the Tauri shell. The native shell starts the sidecar with a per-launch token, waits for its `ready` event, and navigates the existing Web GUI into the native window. It never installs npm packages at runtime; the sidecar is built from the repository's production workspace closure.

## Build

```sh
./build-desktop.sh
```

The executable build script detects the macOS architecture, puts the active Rust toolchain on `PATH`, builds the Node sidecar for that architecture, and builds the `.app`. Use `./build-desktop.sh --dmg` to also build a DMG, `./build-desktop.sh --skip-sidecar` for Rust-only changes, and `./build-desktop.sh --help` for all options. The sidecar builder emits `apps/desktop/dist-desktop/dsh-desktop-runtime-macos-<arch>` and copies it, the macOS spawn helper, and the target-native ripgrep binary into `apps/desktop/src-tauri/binaries/`. The Tauri configuration bundles those artifacts and requires macOS 13.5 or newer.

```sh
PATH="/usr/local/opt/rustup/bin:$PATH" cargo check
PATH="/usr/local/opt/rustup/bin:$PATH" cargo fmt --check
```

Run `pnpm --filter @deepseek-ai/dsh-desktop-runtime run tauri:build` with the same Rust `PATH` to build the `.app` bundle. A DMG target is optional; Tauri's `dmg` bundle needs a working local `hdiutil`/Finder environment.

## Runtime protocol

The sidecar writes one JSON object per stdout line: `{type:'ready',url}`, `{type:'fatal',message}`, or `{type:'shutdown'}`. The shell writes `{type:'shutdown'}` to its stdin to request graceful disposal. The token is a 43-character base64url value generated from 32 random bytes; HTTP uses `Authorization: Bearer <token>`, and WebSocket upgrades use the `dsh-desktop-token.<token>` subprotocol. The token is injected into the page global, never served as HTML content.

The default workspace is `$HOME/DeepSeek Harness Workspaces/Default`. Before mounting the profile tree, the sidecar refreshes its installation-specific module fallbacks under `$DSH_HOME`; user profile and home `cordis.patch.yml` files remain editable, and relative local plugin paths resolve from the profile directory.

## Layout

- `build-desktop.sh` is the executable macOS packaging entry.
- `src/` is the sidecar entry and protocol.
- `src-tauri/` is the Rust native shell, window, process, and navigation code.
- `local-shared/` is the Tauri loading/error page.
- `scripts/build-desktop-sidecar.ts` is the workspace deploy and SEA packaging pipeline.

## Security

The sidecar binds only to `127.0.0.1` on a dynamic port. HTTP and WebSocket routes require the launch token; Tauri permits only its own shell pages and the current loopback origin, and opens external HTTP(S) URLs with the system browser.

The shell enables Tauri's `devtools` feature, registers an `open_devtools` command, and injects `window.__DSH_DESKTOP_OPEN_DEVTOOLS__` for the General settings row. A dedicated remote capability grants only that command to the `main` window from `http://127.0.0.1:*`; `show_log_path` remains a local capability.
