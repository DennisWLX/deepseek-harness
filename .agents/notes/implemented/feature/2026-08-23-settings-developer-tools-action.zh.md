# Agent Note: 设置中的开发者工具操作

Status: implemented

[English](2026-08-23-settings-developer-tools-action.md) | 中文

## 问题

桌面 Web GUI 由 Node sidecar 通过回环 HTTP origin 提供。普通浏览器部署不得渲染 Tauri 专属控件，回环 origin 也不应仅为了打开检查器就获得宽泛的 Tauri IPC 权限。

## 决策

Tauri 壳启用 `devtools` Cargo feature，并注册自定义命令 `open_devtools`。`WebviewWindowBuilder` 启用 devtools，初始化脚本注入 `window.__DSH_DESKTOP_OPEN_DEVTOOLS__`，该函数调用此命令。构建脚本在应用 ACL manifest 中登记 `open_devtools` 与 `show_log_path`。本地 capability 授予 `show_log_path`；单独的 `desktop-devtools` capability 只向 `main` 窗口授予来自 `http://127.0.0.1:*` 的 `open_devtools`。`ui-settings-general` 在「通用」分区以 order 30 注册**开发者工具**行。该行仅在桥接函数存在时渲染，经 promise-aware action 调用它，并在报告本地化错误后恢复可用。

## 曾考虑的替代方案

**在「通用」分区直接调用 Tauri IPC，而不使用 Rust 命令。** 否决，因为当前前端没有 `@tauri-apps/api` runtime，且浏览器插件 bundle 必须保持平台无关。直接调用 `__TAURI_INTERNALS__` 会让应用代码暴露 Tauri 的内部实现细节。

**向远程 sidecar origin 授予 `core:default` 或全部自定义命令。** 否决，因为设置按钮只需要一个命令。专属命令权限可避免回环 Web 内容访问其他 Tauri IPC。

**只使用平台快捷键。** 否决，因为快捷键因平台而异，也没有可发现的应用内操作。

## 后果

发布构建包含 Tauri 的 `devtools` feature，因此打包版本也能打开检查器。在 macOS 上这依赖 Tauri 的私有检查器 API，不适合 App Store 发布。浏览器部署不渲染该行，远程 origin 只获得范围很窄的 `open_devtools` 命令。

## 测试

`ui-settings-general` 组件测试覆盖隐藏/可见渲染、桥接调用和拒绝恢复。其 apply 测试覆盖行注册以及 HMR/卸载。`cargo check` 验证 Rust 命令与生成的 capability schema。没有组装式 Tauri e2e lane，因此原生检查器打开仍需在桌面端手动确认。
