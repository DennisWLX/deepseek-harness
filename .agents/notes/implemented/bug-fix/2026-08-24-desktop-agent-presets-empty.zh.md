# Agent Note: 桌面 Agent 预设列表为空

Status: implemented

[English](2026-08-24-desktop-agent-presets-empty.md) | 中文

## 问题

桌面设置界面显示了 `Agent 预设` 导航项，但该分区没有标题和预设卡片。Web 端显示同一个分区时正常。桌面端 `agentPreset.list` RPC 返回 `presets: []`，而 Web 端的相同请求返回随附的 `standard`、`code`、`minimal` 和 `cordis` 预设。

## 决策

`apps/desktop/src/profile-composition.ts` 会把随附的预设根目录追加到桌面 profile 层级。该目录从已安装的 `@deepseek-ai/dsh` 包解析，这个包已经携带 `config/agent-presets`，并为 Web 启动器提供相同的预设文件。`apps/desktop/src/runtime-entry.ts` 在初始组合和 live profile 补丁中都应用该 overlay。

`packages/preset/agent-presets/src/discovery.ts` 不再假设 `readdir(..., { withFileTypes: true })` 一定返回 `Dirent` 实例。桌面 SEA 虚拟文件系统可能返回普通名称，因此 discovery 读取名称，并用 `lstat` 检查每个候选目录。这样普通文件系统和 pkg 虚拟文件系统上的预设发现契约保持一致。

## 曾考虑的替代方案

**把预设文件复制到 desktop package。** 否决，因为 `@deepseek-ai/dsh` 已经拥有并发布相同文件；再复制一份会形成重复的事实来源。

**桌面 roster 为空时隐藏 Agent 预设分区。** 否决，因为空分区会掩盖缺失的部署资源，而不是恢复本应随附的预设。

**针对 pkg 文件系统做特殊处理。** 否决，因为发现逻辑属于 `dsh-agent-presets`，应该使用可移植的文件系统调用，而不是让宿主包耦合 pkg 内部实现。

## 后果

桌面 Agent 预设分区现在会显示随附的 system 预设，用户自行创建的预设仍来自可写的 user root。discovery 会对每个候选目录执行一次 `lstat`，次数受预设根目录中的条目数约束，不会改变 Web 端面向用户的行为。

## 测试

新的桌面 profile 组合测试固定了 system-root overlay 及其 `trust: system` 值。预设 discovery 测试通过让 `readdir` 返回普通名称来固定虚拟文件系统行为。重建后的 macOS x64 sidecar 经真实 RPC 端点返回全部四个随附预设；无头 Playwright 验证能打开 `Agent 预设`、看到分区标题和 `标准模式`，且没有 console error。
