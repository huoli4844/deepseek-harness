---
description: "通过 Harness Web 服务器提供元枢登录页和静态资源，让浏览器用户在应用同源地址完成认证。"
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-login-server

[English](README.md) | 中文

## 概述

挂载此插件可通过 Harness Web 服务器提供构建后的元枢登录页。页面会向配置的元枢 API URL 发起认证、保存浏览器 token，并返回 Harness 应用。只有已通过 Harness 浏览器认证的会话才能获取回跳地址。登录路由提供页面前，必须先构建前端。

## 目录

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将插件加入包含可用 Web 服务器且已构建登录前端的组合中。

### 何时选择

部署需要同源登录页时选择此插件。元枢后端仍由独立服务提供。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-yuanshu-login-server'
  inject: [webServer, connection, webApp]
  config:
    yuanshuApiUrl: http://localhost:8081
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `loginDist` | 包解析出的应用 `dist` 目录 | 构建后的登录页和静态资源 |
| `yuanshuApiUrl` | `http://localhost:8081` | 注入登录页的元枢后端 URL |

完整字段列表见生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-yuanshu-login-server)。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

插件为登录页、静态资源、favicon 和已认证浏览器交接注册四个 Web 服务器路由。交接路由会拒绝没有有效 Harness 浏览器会话的请求，并将进程 token 加入应用公告 URL。Cordis effect 会在插件卸载时释放每个路由。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 提供静态页面并注册路由 |

</details>

<a id="further-exploration"></a>
## 进一步探索

- [元枢网关](../yuanshu-gateway/README.zh.md) — 浏览器同源 API 调用。
- [登录前端](../../../apps/yuanshu-login/README.zh.md) — 构建和认证流程。

<a id="model-experience"></a>
## 模型体验

无，因为登录页和静态资源不会注册面向模型的功能。

#### KV Cache 影响

该插件不会构造模型请求，也不会改变提供方缓存的复用行为。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **页面依赖已构建的资源** — 缺少 `index.html` 时，`/login` 返回 HTTP 500。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
