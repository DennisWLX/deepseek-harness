---
description: "Tauri desktop profile layer for dsh: authenticated loopback transport, native-shell startup policy, and desktop model context."
kind: "package-bundle"
---

# @deepseek-ai/dsh-desktop-app

English | [中文](README.zh.md)

## Summary

`dsh-desktop-app` turns the existing Web surface into the authenticated loopback application hosted by the Tauri desktop shell. The shipped `desktop` profile already includes this layer after `dsh-base` and `dsh-web-app`; ordinary desktop users do not install it separately. It fixes the server to a dynamic `127.0.0.1` port, requires the per-launch desktop token on HTTP and WebSocket traffic, suppresses browser handoff, and replaces the Web prompt section with desktop-window context. The bundle does not provide a Web server, frontend, or native process by itself; the [desktop runtime](../../../apps/desktop/README.md) owns launch and lifecycle.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The Tauri sidecar starts the shipped `desktop` profile, so its normal entry path is the desktop application rather than a direct `dsh` command. A custom Tauri profile may add or remove the layer through the standard bundle workflow:

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-desktop-app
dsh plugin --profile <name> remove @deepseek-ai/dsh-desktop-app
```

The successful pnpm operation reconciles the package's `dsh.bundle.patch` declaration into or out of the profile manifest; restart the profile after changing bundle membership. In-box bundles resolve from the running dsh installation before the profile's `node_modules`, while an out-of-tree copy resolves from that profile. A listed package without a bundle patch declaration fails profile loading.

### What you get

The layer publishes a validated `desktopRuntime` service carrying the launch token and fixed bind values, then patches the Web server and Connection rows to consume it. HTTP RPC calls use a bearer credential; Gateway WebSocket upgrades use the dedicated desktop subprotocol because the browser API cannot set upgrade headers. The layer also disables Web URL printing and browser opening, removes extra trusted hosts, and mounts the desktop surface prompt.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The patch is the third layer of the shipped desktop profile. It inserts `desktop-startup` and `desktop-app`, replaces the Web server config with the fixed loopback and dynamic-port values, disables the Web runtime's browser behavior and surface prompt, and replaces the Connection config with the empty trusted-host list and validated access token. Patch targets replace complete `config` values, so the document restates every field the desktop surface retains.

`desktop-startup` validates `DSH_DESKTOP_ACCESS_TOKEN` before providing `desktopRuntime`; malformed or absent values fail startup. Connection owns Host/Origin checks and both credential forms, while API Gateway asks Connection to authorize the stream upgrade before accepting it. Tauri injects the token into the page global before navigation, and the client Connection attaches it to both physical transports.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Desktop overlay applied after the Web bundle |
| [`src/startup.ts`](src/startup.ts) | Launch-token validation and fixed bind service |
| [`src/index.ts`](src/index.ts) | Desktop model-facing surface section |
| [`src/invariant.ts`](src/invariant.ts) | Empty invariant companion; owning services enforce the live relations |
| [`tests/desktop.spec.ts`](tests/desktop.spec.ts) | Startup values, token rejection, prompt text, and cleanup |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Bundle package map](../README.md) — the profile layers shipped with dsh.
- [dsh-web-app](../web-app/README.md) — the browser application this layer adapts.
- [Desktop runtime](../../../apps/desktop/README.md) — Tauri and sidecar launch, packaging, and security policy.
- [Client Connection](../../client/connection/README.md) — HTTP, WebSocket, and browser authentication ownership.
- [Tauri desktop runtime decision](../../../.agents/notes/implemented/architecture/2026-08-23-tauri-desktop-runtime.md) — the native-shell and sidecar design.

-----

<a id="model-experience"></a>
## Model Experience

### Desktop surface context

#### What the model sees

The `app:web-surface` section contains a short orientation that names the desktop application, the current loopback URL, and the visible native-window identity. The Web bundle's own surface prompt is disabled by this bundle.

#### Token effect

One fixed short paragraph plus the current loopback URL per process.

#### KV Cache effect

The paragraph is stable for the process; the port is a boot fact and does not change the prompt prefix across turns.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits follow from the bundle's role as a Tauri-only overlay over the Web application.

- **The Web layer must already exist** — this patch replaces Web server, Web runtime, and Connection rows; it does not insert those capabilities.
- **The desktop token is launcher-owned** — booting this bundle outside the Tauri sidecar without `DSH_DESKTOP_ACCESS_TOKEN` fails at startup.
- **Desktop bind facts are fixed** — the bundle does not expose a configurable host or port; the sidecar and Tauri shell own those values.
- **Profile order is significant** — the desktop layer belongs after `dsh-web-app`, where its complete-config replacements override the browser defaults.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
