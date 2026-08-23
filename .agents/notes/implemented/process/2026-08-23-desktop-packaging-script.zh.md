# Agent Note: 桌面打包脚本

Status: implemented

[English](2026-08-23-desktop-packaging-script.md) | 中文

## 问题

构建桌面应用需要人工选择 sidecar 架构、把当前 Rust toolchain 放到 `PATH`，再执行 Tauri 命令。遗漏 sidecar 重建会让 `.app` 继续携带旧的 Node 产物，缺少 Rust `PATH` 则会在壳构建开始前直接失败。

## 决策

`apps/desktop/build-desktop.sh` 是可执行的 macOS 打包入口。它从脚本位置推导仓库根目录，通过 `uname -m` 识别 `x64` 或 `arm64`，经 `rustup which cargo` 解析当前 `cargo`，把该 toolchain 目录前置到 `PATH`，并在构建前检查 Node 与 pnpm。默认路径构建当前架构的 Node sidecar 和 `.app`；`--dmg` 同时构建 DMG，`--skip-sidecar` 用于只改 Rust 的情况，`--arch=x64|arm64` 覆盖架构检测。

脚本不清理仓库。现有 sidecar builder 负责暂存目录清理和仓库构建。

## 曾考虑的替代方案

**只增加 npm script。** 否决，因为调用者仍需处理 Rust toolchain 和架构相关的 sidecar 目标，而且它不能作为可直接执行的 shell 入口使用。

**把架构检测加入 TypeScript sidecar builder，并另写一个 Tauri 包装器。** 否决，因为打包决策跨越两个既有命令，shell 预检很小。sidecar builder 仍是 staging、打包和原生 sidecar 落位规则的权威来源。

**让脚本支持 Windows 和 Linux。** 否决，因为当前桌面 bundle 配置只发布 macOS 目标，sidecar builder 也只接受 macOS 架构。

## 后果

开发者只需一条命令即可打包当前 macOS 架构；缺少前置工具时，脚本会在耗时构建开始前明确失败。显式跨架构或多目标打包仍使用底层 builder，因为包装器不改变 Tauri 目标选择或 sidecar 目标语法。

## 测试

脚本通过 `bash -n`，帮助路径返回零，不支持的架构路径在执行构建前返回非零。正常构建路径委托给现有 sidecar builder 与 Tauri CLI，其验证由桌面构建和 `tauri:check` 覆盖。
