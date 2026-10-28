---
description: "让浏览器插件通过 Harness 同源 Web 服务器调用选定的元枢智能体与知识 API。"
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-gateway

[English](README.md) | 中文

## 概述

当浏览器功能需要访问选定的元枢 API、且不应直接跨域请求平台时，挂载此插件。网关通过 Harness Web 服务器转发智能体执行、知识问答、租户和能力查询。它使用请求中的 Bearer token，或使用配置的服务器默认 token。

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

浏览器调用需要同源传输时选择网关。服务器端插件可以直接调用 [`yuanshu-client`](../yuanshu-client/README.zh.md)。

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
| `token` | 未设置 | 请求没有授权头时使用的默认 Bearer token |
| `prefix` | `/yuanshu-api` | 同源路由前缀 |

完整字段列表见生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-yuanshu-gateway)。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

路由为每个请求创建 YuanShu 客户端，避免一个浏览器用户的 Bearer token 或租户请求头改变其他请求的凭据。路由只拥有选定的 API 路径，不提供通用上游代理。

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
