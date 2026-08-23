# 桌面应用

[English](README.md) | 中文

DeepSeek Harness 的 Tauri 桌面应用。本目录中的仓库代码包括 Node sidecar 的部署 manifest、NDJSON 控制协议和 Tauri 壳。原生壳使用每次启动随机生成的 token 启动 sidecar，等待它的 `ready` 事件，再把现有 Web GUI 导航到原生窗口。运行时不会安装 npm 包；sidecar 由仓库的生产 workspace 闭包构建。

## 构建

```sh
pnpm run build
pnpm exec tsx scripts/build-desktop-sidecar.ts --targets=node24-macos-x64
```

sidecar 构建器在 `apps/desktop/dist-desktop/dsh-desktop-runtime-macos-<arch>` 生成可执行文件，并将其、macOS spawn helper 和匹配目标架构的 ripgrep 二进制复制到 `apps/desktop/src-tauri/binaries/`。Tauri 配置会打包这些产物，要求 macOS 13.5 或更高版本。

```sh
PATH="/usr/local/opt/rustup/bin:$PATH" cargo check
PATH="/usr/local/opt/rustup/bin:$PATH" cargo fmt --check
```

使用同样的 Rust `PATH` 运行 `pnpm --filter @deepseek-ai/dsh-desktop-runtime run tauri:build` 可构建 `.app` bundle。DMG 目标是可选项；Tauri 的 `dmg` bundle 需要本机 `hdiutil`/Finder 环境。

## 运行时协议

sidecar 在 stdout 每行写一个 JSON 对象：`{type:'ready',url}`、`{type:'fatal',message}` 或 `{type:'shutdown'}`。壳向 stdin 写 `{type:'shutdown'}` 请求优雅释放。token 由 32 个随机字节生成，编码为 43 个 base64url 字符；HTTP 使用 `Authorization: Bearer <token>`，WebSocket 升级使用 `dsh-desktop-token.<token>` 子协议。token 注入页面全局变量，不作为 HTML 内容输出。

默认 workspace 是 `$HOME/DeepSeek Harness Workspaces/Default`。`$DSH_HOME` 下的用户 profile 和 home 级 `cordis.patch.yml` 文件仍可编辑；相对本地插件路径从 profile 目录解析。

## 目录结构

- `src/` 是 sidecar 入口与协议。
- `src-tauri/` 是 Rust 原生壳、窗口、进程和导航代码。
- `local-shared/` 是 Tauri 加载/错误页面。
- `scripts/build-desktop-sidecar.ts` 是 workspace 部署与 SEA 打包流水线。

## 安全

sidecar 只绑定 `127.0.0.1` 动态端口。HTTP 和 WebSocket 路由需要启动 token；Tauri 只允许自己的壳页面和当前回环 origin，并使用系统浏览器打开外部 HTTP(S) URL。
