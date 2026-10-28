---
description: "在浏览器会话页中添加元枢知识问答视图，并通过 Harness 同源网关发送请求。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-yuanshu-chat

[English](README.md) | 中文

## 概述

挂载此浏览器插件后，可以在会话视图中向元枢提交知识问题。插件会向同源 `/yuanshu-api` 网关发送请求，并从 `localStorage.yuanshu-token` 读取浏览器 token。Host profile 必须同时挂载元枢网关。

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

将该包加入包含会话 slots 和 locale 服务的 Client 组合。

### 何时选择

需要浏览器知识问答视图时选择此插件。面向模型的 [`yuanshu_qa` 工具](../../yuanshu/yuanshu-qa-tool/README.zh.md)独立提供，可不依赖此视图。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-client-ui-yuanshu-chat'
```

该视图没有插件配置。Host 需要提供登录页和同源网关路由。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

插件通过 slot registry 注册 locale 字典并注入会话视图。视图向 Host 网关发送 SSE 请求，并显示完成后的答案和引用。

| 文件 | 作用 |
|---|---|
| [`src/client/apply.tsx`](src/client/apply.tsx) | 注册 locale、网关客户端和会话视图 |
| [`src/client/ChatPanel.tsx`](src/client/ChatPanel.tsx) | 输入问题、处理流式请求并显示结果 |

</details>

<a id="further-exploration"></a>
## 进一步探索

- [元枢网关](../../yuanshu/yuanshu-gateway/README.zh.md) — 同源上游路由。
- [元枢问答工具](../../yuanshu/yuanshu-qa-tool/README.zh.md) — 面向模型的知识问答。

<a id="model-experience"></a>
## 模型体验

无，因为浏览器视图不会注册模型工具、提示或会话事件。

#### KV Cache 影响

该视图不会构造模型请求，也不会改变提供方缓存的复用行为。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **需要 Host 集成** — 只有挂载同源网关且登录页已保存浏览器 token 后，视图才能访问元枢。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
