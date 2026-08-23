# `@deepseek-ai/dsh-desktop-app`

[English](README.md) | 中文

dsh 原生桌面组合包。[`cordis.patch.yml`](cordis.patch.yml) 叠加在 [`dsh-web-app`](../web-app/README.zh.md) 之上，把 Tauri sidecar 组合层插入 Web profile：通过 `desktop-startup` 发布校验后的启动 token 和固定的回环动态端口绑定，关闭 Web 浏览器交接，把 `/api` connection 信任围栏限制为空 trusted-host 列表，并挂载原生壳界面提示。它自身不提供 Web server 或浏览器应用；[`dsh-desktop-runtime`](../../../apps/desktop/README.zh.md) 部署 manifest 和 Tauri 壳负责启动这套组合。

`desktop-startup` 读取 `DSH_DESKTOP_ACCESS_TOKEN`，拒绝格式错误的 token，并发布 `desktopRuntime` 值 `{accessToken, host: '127.0.0.1', port: 0}`。webserver 和 connection 配置行消费该服务，因此没有 token 的 sidecar 无法启动桌面界面。该组合包还导出 runtime 使用的 `desktop-app` 提示插件和一个空的 invariant companion。

## 模型体验

### 桌面界面上下文

#### What the model sees

`app:web-surface` 段包含一段简短定位说明，指出当前桌面应用、当前回环 URL 和可见原生窗口身份。Web bundle 自己的 surface prompt 被该组合包禁用。

#### Token effect

每个进程固定一段简短文本，外加当前回环 URL。

#### KV Cache 影响

该段文本在整个进程生命周期内稳定；端口是启动事实，不会改变跨轮次提示词前缀。

## 已知限制与暂缓事项

- **桌面 token 由启动器持有**：不在 Tauri sidecar 中启动这个组合包，又没有 `DSH_DESKTOP_ACCESS_TOKEN`，启动会失败。
- **桌面绑定值是固定的**：该组合包不暴露可配置的 host 或 port；这些值由 sidecar 和 Tauri 壳负责。
