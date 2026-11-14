---
description: "让浏览器插件通过 Harness 同源 Web 服务器调用选定的元枢智能体与知识 API。"
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-gateway

[English](README.md) | 中文

## 概述

挂载此插件以连接 DSH 浏览器功能与元枢。企业能力默认通过官方 MCP 客户端和用户 OAuth grant 调用；同源路由用于登录、租户选择和文件传输等选定 HTTP 操作。

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

将此包作为 Cordis 插件加载，并配置上游 URL。

### 何时选择

浏览器侧元枢访问使用此网关。仅在明确的回退窗口中设置 `enterpriseTransport: legacy-http`；MCP 调用失败不会自动回退到 HTTP。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-yuanshu-gateway'
  config:
    baseURL: http://localhost:8081
    prefix: /yuanshu-api
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | 必填 | 元枢 API 基础 URL |
| `prefix` | `/yuanshu-api` | 同源路由前缀 |
| `enterpriseTransport` | `mcp` | 企业能力使用 MCP；`legacy-http` 仅用于显式回退 |
| `mcpClientId` | `dsh-yuanshu` | 已注册的公共 OAuth 客户端标识 |
| `mcpIssuer` | 根据 `baseURL` 推导 | 预期授权服务器 issuer |
| `mcpResource` | 根据 `baseURL` 推导 | 受保护的 MCP 资源 URL |
| `mcpRedirectUri` | 本地回环回调 | 已注册的 Authorization Code + PKCE 回调地址 |

完整字段列表见生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-yuanshu-gateway)。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

网关按已认证的 DSH 用户和所选租户隔离 MCP grant。用户作用域客户端负责 MCP 发现、issuer/resource 校验、刷新和撤销；平台登录 token 或实例级 Bearer token 不能作为 MCP 授权。

同一登录和租户的重叠请求共享一个 MCP 客户端及发现操作。每次协议请求读取当前授权；最后一个请求结束时释放客户端，插件释放时关闭活跃客户端。不同用户、租户和插件实例之间不共享客户端。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 注册路由、解析 token 并转发响应 |

</details>

<a id="further-exploration"></a>
## 进一步探索

- [元枢客户端](../yuanshu-client/README.zh.md) — 直接发起 HTTP 和 SSE 请求。
- [元枢聊天视图](../../client/ui-yuanshu-chat/README.zh.md) — 使用此路由的浏览器功能。

<a id="model-experience"></a>
## 模型体验

无，因为 HTTP 路由不会注册模型工具、提示或会话事件。

#### KV Cache 影响

网关不会构造模型请求，也不会改变提供方缓存的复用行为。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **仅支持选定路由** — 调用方不能把此插件用作通用元枢 API 代理。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
