# Agent Note: 桌面部署使用隔离工作区

Status: implemented

[English](2026-08-23-desktop-deploy-ignore-scripts.md) | 中文

## 问题

桌面 sidecar builder 曾在仓库根目录执行 `pnpm deploy --prod --ignore-scripts`。pnpm 的 legacy deploy 路径仍会执行仓库根目录的 postinstall，该 postinstall 导入生产部署不会包含的开发专用 Lefthook 包，因此打包在 Tauri 编译前失败。在根目录执行生产 deploy 还可能把 `node_modules/.modules.yaml` 重写为 production-only 状态，导致之后的本地安装遗漏开发依赖。

## 决策

`scripts/build-desktop-sidecar.ts` 会把打包所需的仓库源码复制到一次性临时 workspace。它在该 workspace 中执行现有 legacy `pnpm deploy` 命令并传入 `npm_config_ignore_scripts=true`，在删除副本前处理 staging 中的 workspace 符号链接，部署目标仍保留在真实仓库目录中。

临时副本排除依赖树、Git 元数据、桌面打包产物、Tauri 构建输出和环境文件。`--ignore-scripts` CLI flag 仍保留，因为它能向遵守该参数的 pnpm 实现表达意图；环境值负责在 legacy deploy 模式下跳过 workspace 根目录的生命周期脚本。

## 曾考虑的替代方案

**在仓库根目录执行 legacy deploy，并仅跳过生命周期脚本。** 否决，因为它可能把已检出的 `node_modules/.modules.yaml` 重写为 production-only 状态，破坏之后的本地安装。

**使用非 legacy 的 `pnpm deploy`。** 否决，因为桌面闭包包含非 injected workspace 包；pnpm 会以 `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE` 失败。

**让 Lefthook installer 容忍缺失依赖。** 否决，因为生产部署根本不应执行开发环境 Git hook 安装。在 import 阶段增加容错会保留本不应发生的 postinstall 执行，并掩盖其他开发专属生命周期错误。

**把 Lefthook 移到根 production dependencies。** 否决，因为这会把 Git hook 工具及其平台二进制加入打包运行时闭包。

**删除仓库根目录 postinstall。** 否决，因为它是本地 checkout 的预期安装路径。

## 后果

生产桌面部署只会在一次性 workspace 中安装运行时依赖闭包，并且不会改变已检出的 `node_modules` 状态。本地 `pnpm install` 仍会正常执行 Lefthook postinstall。代价是每次部署都要复制一次源码树；临时 workspace 无论成功或失败都会被删除。

## 测试

真实的 macOS x64 命令 `pnpm exec tsx scripts/build-desktop-sidecar.ts --skip-build --targets=node24-macos-x64` 已成功完成并生成 Tauri sidecar。运行前后 `node_modules/.modules.yaml` 的 SHA-256 hash 保持一致，且没有留下 `dsh-desktop-deploy-*` 临时 workspace。
