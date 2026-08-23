# Agent Note: Desktop Agent Preset roster is empty

Status: implemented

English | [中文](2026-08-24-desktop-agent-presets-empty.zh.md)

## Problem

The desktop settings shell showed the `Agent 预设` navigation entry, but the section had no heading or preset cards. The Web surface rendered the same section normally. The desktop `agentPreset.list` RPC returned `presets: []`, while the same request returned the shipped `standard`, `code`, `minimal`, and `cordis` presets on the Web surface.

## Decision

`apps/desktop/src/profile-composition.ts` appends the shipped preset root to the desktop profile layers. The root is resolved from the installed `@deepseek-ai/dsh` package, which carries `config/agent-presets` and already supplies the same preset files to the Web launcher. `apps/desktop/src/runtime-entry.ts` applies that overlay to both initial composition and live profile patching.

`packages/preset/agent-presets/src/discovery.ts` no longer assumes `readdir(..., { withFileTypes: true })` returns `Dirent` instances. The desktop SEA virtual filesystem can return plain names, so discovery reads names and checks each candidate with `lstat`. This keeps the same preset discovery contract on ordinary filesystems and pkg's virtual filesystem.

## Alternatives considered

**Copy the preset files into the desktop package.** Rejected because `@deepseek-ai/dsh` already owns and ships the same files; a second copy would add a duplicate source of truth.

**Hide the Agent Preset section when the desktop roster is empty.** Rejected because an empty section would conceal a missing deployment resource rather than restore the intended shipped presets.

**Special-case the pkg filesystem.** Rejected because discovery belongs to `dsh-agent-presets` and should use portable filesystem calls instead of coupling the host package to pkg internals.

## Consequences

The desktop Agent Preset section now renders the shipped system presets while user-authored presets continue to come from the writable user root. Discovery performs one `lstat` per candidate directory, which is bounded by the number of entries under a preset root and does not change the user-visible behavior on the Web surface.

## Testing

The new desktop profile-composition test pins the system-root overlay and its `trust: system` value. The preset-discovery test pins the virtual-filesystem behavior by returning plain names from `readdir`. A rebuilt macOS x64 sidecar returns all four shipped presets through the real RPC endpoint, and a headless Playwright pass opens `Agent 预设`, sees the section heading, and finds `标准模式` with no console errors.
