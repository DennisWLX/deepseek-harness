# Agent Note: Desktop Agent Preset roster is empty

Status: implemented

English | [中文](2026-08-24-desktop-agent-presets-empty.zh.md)

## Problem

The desktop settings shell showed the `Agent 预设` navigation entry, but the section had no heading or preset cards. The Web surface rendered the same section normally. The desktop `agentPreset.list` RPC returned `presets: []`, while the same request returned the shipped `standard`, `ptc`, `minimal`, and `cordis` presets on the Web surface.

## Decision

`@deepseek-ai/dsh-agent-presets` owns the shipped preset files and prepends its package-local `presets/` directory as a system root by default. Every host, including the desktop sidecar, receives the same built-in roster without a host-specific profile patch. A deployment can set `includeShippedRoot: false` when it intentionally supplies only external presets.

`packages/preset/agent-presets/src/discovery.ts` no longer assumes `readdir(..., { withFileTypes: true })` returns `Dirent` instances. The desktop SEA virtual filesystem can return plain names, so discovery reads names and checks each candidate with `lstat`. This keeps the same preset discovery contract on ordinary filesystems and pkg's virtual filesystem.

## Alternatives considered

**Copy the preset files into the desktop package.** Rejected because `@deepseek-ai/dsh-agent-presets` already owns and ships the files; a second copy would add a duplicate source of truth.

**Resolve a preset directory from the CLI package in the desktop profile.** Rejected because the preset package can derive its own installed resource path in source, built, and packaged runtimes. A host-specific overlay would couple the desktop deployment to another application's file layout.

**Hide the Agent Preset section when the desktop roster is empty.** Rejected because an empty section would conceal a missing deployment resource rather than restore the intended shipped presets.

**Special-case the pkg filesystem.** Rejected because discovery belongs to `dsh-agent-presets` and should use portable filesystem calls instead of coupling the host package to pkg internals.

## Consequences

The desktop Agent Preset section renders the shipped system presets while user-authored presets continue to come from the writable user root. Discovery performs one `lstat` per candidate directory, which is bounded by the number of entries under a preset root and does not change the user-visible behavior on the Web surface.

## Testing

The shipped-root tests pin the package-local root, its precedence, and its `trust: system` value. The preset-discovery test pins the virtual-filesystem behavior by returning plain names from `readdir`. A rebuilt macOS x64 sidecar returns all four shipped presets through the real RPC endpoint, and a headless Playwright pass opens `Agent 预设`, sees the section heading, and finds `标准模式` with no console errors.
