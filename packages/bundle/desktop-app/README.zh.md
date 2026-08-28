---
description: "dsh 的 Tauri 桌面 profile 层：经认证的回环传输、原生壳启动策略与桌面模型上下文。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-desktop-app

[English](README.md) | 中文

## 概述

`dsh-desktop-app` 把现有 Web 界面转换为由 Tauri 桌面壳托管且经认证的回环应用。随附的 `desktop` profile 已在 `dsh-base` 和 `dsh-web-app` 之后包含该层；普通桌面用户无需单独安装。它把服务器固定到动态 `127.0.0.1` 端口，要求 HTTP 与 WebSocket 流量携带逐次启动的桌面 token，关闭浏览器交接，并用桌面窗口上下文替换 Web 提示词分区。该 bundle 自身不提供 Web server、frontend 或原生进程；启动与生命周期归[桌面 runtime](../../../apps/desktop/README.zh.md)所有。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Tauri sidecar 会启动随附的 `desktop` profile，因此它的常规入口是桌面应用，而不是直接执行 `dsh` 命令。自定义 Tauri profile 可以通过标准 bundle 工作流添加或移除该层：

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-desktop-app
dsh plugin --profile <name> remove @deepseek-ai/dsh-desktop-app
```

pnpm 操作成功后，reconcile 会根据包的 `dsh.bundle.patch` 声明在 profile manifest 中加入或移除该层；改变 bundle 成员后请重启 profile。内置 bundle 先从当前 dsh 安装解析，树外副本则从该 profile 解析。列出的包若没有 bundle patch 声明，profile 加载会失败。

### 你会得到什么

该层发布经验证的 `desktopRuntime` 服务，携带启动 token 和固定绑定值，再让 Web server 与 Connection 配置行消费该服务。HTTP RPC 调用使用 bearer 凭据；Gateway WebSocket 升级使用专用桌面 subprotocol，因为浏览器 API 无法设置升级请求头。该层还关闭 Web URL 输出和浏览器打开行为、移除额外 trusted host，并挂载桌面界面提示词。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

该 patch 是随附 desktop profile 的第三层。它插入 `desktop-startup` 与 `desktop-app`，以固定回环地址和动态端口替换 Web server 配置，关闭 Web runtime 的浏览器行为与界面提示词，并用空 trusted-host 列表和经验证的 access token 替换 Connection 配置。patch 目标会替换完整 `config` 值，因此文档会重述桌面界面保留的每个字段。

`desktop-startup` 在提供 `desktopRuntime` 前验证 `DSH_DESKTOP_ACCESS_TOKEN`；值格式错误或缺失会使启动失败。Connection 持有 Host/Origin 检查和两种凭据形式，API Gateway 在接受 stream 升级前请求 Connection 授权。Tauri 在导航前把 token 注入页面全局变量，client Connection 再把它附加到两种物理传输。

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 应用在 Web bundle 之后的桌面 overlay |
| [`src/startup.ts`](src/startup.ts) | 启动 token 校验与固定绑定服务 |
| [`src/index.ts`](src/index.ts) | 面向模型的桌面界面分区 |
| [`src/invariant.ts`](src/invariant.ts) | 空 invariant companion；live 关系由所属服务执行 |
| [`tests/desktop.spec.ts`](tests/desktop.spec.ts) | 启动值、token 拒绝、提示词文本与清理 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Bundle 包映射](../README.zh.md)——dsh 随附的 profile 层。
- [dsh-web-app](../web-app/README.zh.md)——该层适配的浏览器应用。
- [桌面 runtime](../../../apps/desktop/README.zh.md)——Tauri 与 sidecar 的启动、打包和安全策略。
- [Client Connection](../../client/connection/README.zh.md)——HTTP、WebSocket 与浏览器认证归属。
- [Tauri 桌面 runtime 决策](../../../.agents/notes/implemented/architecture/2026-08-23-tauri-desktop-runtime.zh.md)——原生壳与 sidecar 设计。

-----

<a id="model-experience"></a>
## 模型体验

### 桌面界面上下文

#### What the model sees

`app:web-surface` 段包含一段简短定位说明，指出当前桌面应用、当前回环 URL 和可见原生窗口身份。Web bundle 自己的 surface prompt 被该组合包禁用。

#### Token effect

每个进程固定一段简短文本，外加当前回环 URL。

#### KV Cache 影响

该段文本在整个进程生命周期内稳定；端口是启动事实，不会改变跨轮次提示词前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

以下限制源自该 bundle 作为 Tauri 专用 Web 应用 overlay 的定位。

- **Web 层必须已经存在**：该 patch 会替换 Web server、Web runtime 与 Connection 配置行；它不插入这些能力。
- **桌面 token 由启动器持有**：不在 Tauri sidecar 中启动这个组合包，又没有 `DSH_DESKTOP_ACCESS_TOKEN`，启动会失败。
- **桌面绑定值是固定的**：该组合包不暴露可配置的 host 或 port；这些值由 sidecar 和 Tauri 壳负责。
- **Profile 顺序有意义**：桌面层应位于 `dsh-web-app` 之后，让完整配置替换覆盖浏览器默认值。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
