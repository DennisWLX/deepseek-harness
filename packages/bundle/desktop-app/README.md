# `@deepseek-ai/dsh-desktop-app`

English | [中文](README.zh.md)

The dsh native-desktop bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-web-app`](../web-app/README.md) and inserts the Tauri-sidecar composition over the Web profile: it publishes the validated launch token and fixed loopback/dynamic-port bind through `desktop-startup`, disables Web browser handoff, pins the `/api` connection fence to an empty trusted-host list, and mounts the native-shell surface prompt. It does not provide a Web server or browser application by itself; the [`dsh-desktop-runtime`](../../../apps/desktop/README.md) deploy manifest and Tauri shell own launching this composition.

`desktop-startup` reads `DSH_DESKTOP_ACCESS_TOKEN`, rejects malformed tokens, and publishes `desktopRuntime` with `{accessToken, host: '127.0.0.1', port: 0}`. The webserver and connection rows consume that service, so a sidecar without the token cannot start the desktop surface. The bundle also exports the runtime-facing `desktop-app` prompt plugin and an empty invariant companion.

## Model Experience

### Desktop surface context

#### What the model sees

The `app:web-surface` section contains a short orientation that names the desktop application, the current loopback URL, and the visible native-window identity. The Web bundle's own surface prompt is disabled by this bundle.

#### Token effect

One fixed short paragraph plus the current loopback URL per process.

#### KV Cache effect

The paragraph is stable for the process; the port is a boot fact and does not change the prompt prefix across turns.

## Known Limitations and Deferred Work

- **The desktop token is launcher-owned** — booting this bundle outside the Tauri sidecar without `DSH_DESKTOP_ACCESS_TOKEN` fails at startup.
- **Desktop bind facts are fixed** — the bundle does not expose a configurable host or port; the sidecar and Tauri shell own those values.
