# Agent Note: Tauri 桌面运行时

Status: implemented

[English](2026-08-23-tauri-desktop-runtime.md) | 中文

## Problem

DeepSeek Harness 已有一个由 Node 进程托管的 Web 应用，但没有原生桌面应用。桌面端必须复用现有 Web GUI，保留安装后的 profile 和用户 patch 层，并在不把包管理器嵌入桌面应用的前提下保持运行时的插件与包集合封闭。

## Decision

### 原生壳与 sidecar 分层

桌面应用由 Tauri 壳和 Node sidecar 组成。Tauri 负责窗口创建、导航、外链和进程生命周期。sidecar 是现有 profile 运行时通过 `@yao-pkg/pkg --sea` 打包后的可执行文件，提供动态的回环 HTTP 服务器。壳只在收到 NDJSON `ready` 事件后导航到 sidecar URL；`fatal` 和 `shutdown` 共同完成控制协议。Tauri 以 workspace 目录作为当前目录启动 sidecar，并把 sidecar 的 stdout/stderr 写入应用日志目录。

sidecar 运行 `desktop` profile：`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 和 `@deepseek-ai/dsh-desktop-app`。桌面 bundle 将 webserver 固定在 `127.0.0.1`，关闭浏览器打开行为，并把 Web 界面提示替换为原生壳界面提示。profile 和 home 层的 `cordis.patch.yml` 保留在用户磁盘上并支持热重载。相对本地插件路径继续从 profile 配置目录解析；裸包名从已打包 sidecar 的 `node_modules` 树解析。`client-modules` 与 `typert-loader` 对裸包使用 Loader root context 作为 manifest 解析锚点，对相对 specifier 使用 config-tree context。桌面应用运行时不会执行 `pnpm`，也不会安装包。

### 传输认证

每次启动生成 32 字节随机 token，编码为 43 个 base64url 字符。HTTP 请求携带 `Authorization: Bearer <token>`；WebSocket 升级请求携带专用子协议 `dsh-desktop-token.<token>`，因为浏览器 WebSocket 构造器不能设置请求头。connection 插件拒绝没有有效 token 的所有 `/api` HTTP 请求和 WebSocket 升级。token 由 Tauri 注入页面全局变量，从不写入服务端 HTML。

### 打包

`scripts/build-desktop-sidecar.ts` 在 `apps/desktop/.sidecar-runtime` 下物化生产 workspace 闭包，为每个 macOS 架构生成一个 SEA 可执行文件，并将其复制到 Tauri external-bin 目录。暂存步骤同时复制 `node-pty` 的 spawn helper 和匹配目标架构的 ripgrep sidecar。打包树包含全部 JavaScript、包 manifest、原生 `.node` 文件，以及 Web 应用图片附件路径所需的 macOS libvips `.dylib`。Tauri 配置把 sidecar 放进应用 bundle，同时保留平台扩展点；macOS 是首个发布目标。

部署前，builder 会把 workspace 源码复制到临时目录，并在该目录中执行跳过生命周期脚本的 legacy 生产 deploy。这样可以避免生产安装改写已检出的 `node_modules`；临时 workspace 会在 staged links 物化完成后删除。

部署前，desktop profile resolver 还会追加随附的 `@deepseek-ai/dsh` 预设根目录；preset discovery 使用可移植的目录检查来兼容 pkg 的虚拟文件系统。

## Testing

Host 与浏览器 connection 测试覆盖 Bearer 解析、常量时间比较、WebSocket 子协议解析和客户端 token 附加。runtime 测试覆盖桌面 bundle 与控制协议。两个 manifest 扫描器的回归测试将可解析的运行时根目录与空的 profile 根目录并置，验证裸包可以组合或注册。已构建的 macOS sidecar 冒烟使用 43 字符 token 启动，报告 `ready`，接受带认证的 HTTP 与 WebSocket 连接，并在 `shutdown` 后以 0 退出；其 HTML 断言要求非空 `__DSH_BOOT__` graph 与 modules/runtime parser preload。Tauri `.app` 构建能启动托管状态，在应用日志中收到 sidecar 的 `ready` 事件，并在关闭时不写 stderr。

## Alternatives considered

**把 JavaScript 直接嵌入 Tauri。** 否决，因为现有 Web GUI 依赖 Node 后端和 Web server；只做一个浏览器壳不能保持现有 Web 应用行为。

**使用 Electron。** 否决，因为桌面应用只需要一个很小的原生壳，现有 Node 运行时已经承担后端；Tauri 让这个边界保持显式，并让打包后的运行时保持独立。

**允许桌面运行时通过 pnpm 安装包。** 否决，因为这会使用户 profile 编辑能够改变应用运行时依赖图，破坏可复现性并扩大桌面攻击面。profile 层继续通过现有 profile 机制由用户管理。

**暴露固定端口，或把 token 写入服务端 HTML。** 否决，因为动态回环端口和每次启动随机 token 能减少跨启动与本地网络暴露，而浏览器 WebSocket API 需要把 token 放在一个无需请求头即可发送的位置。

## Consequences

桌面应用复用 Web GUI 和现有 Cordis 组合，原生壳只负责 OS 集成与生命周期。SEA sidecar 是更大的原生产物，并依赖 pkg 的 VFS 模块钩子；更新包或扩展平台都需要重新构建 sidecar。macOS 构建必须显式暂存 sharp 的 libvips 和原生 sidecar。sidecar 仍是封闭运行时，但用户 profile 层和相对本地插件无需修改应用 bundle 即可继续编辑。
