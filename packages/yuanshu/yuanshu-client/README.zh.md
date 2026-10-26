---
description: "在 Node 或浏览器代码中调用元枢智能体与知识 API，支持 JSON 响应、认证、租户选择和 SSE 解码。"
kind: "package-library"
---

# @deepseek-ai/dsh-yuanshu-client

[English](README.md) | 中文

## 概述

使用 `YuanShuClient` 可以从负责用户操作的包调用元枢智能体、租户、能力和知识端点。客户端允许注入 `fetch` 实现，以便控制传输和测试。它不会注册 Harness 工具或 Cordis 服务。

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

### 何时使用

需要元枢 HTTP 或 SSE 操作时，可从相应插件中使用客户端；若 Agent 需要调用这些操作，则挂载 `yuanshu-tool` 等插件。

### 入口

```ts
import { YuanShuClient } from '@deepseek-ai/dsh-yuanshu-client'

const client = new YuanShuClient({ baseURL: 'http://localhost:8081' })
const capabilities = await client.listCapabilities()
```

`listCapabilities()` 会自动遍历元枢的分页信封（`list/total/page/page_size`），也兼容旧网关直接返回数组的响应。调用成功时返回解码后的能力列表；HTTP 错误和元枢错误响应会以 `YuanShuError` 拒绝，不会把权限失败伪装成空能力列表。方法和取消行为详见 [`src/index.ts`](src/index.ts)。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

客户端集中处理 URL 拼接、Bearer 和租户请求头、JSON 响应信封及 SSE 解码。认证状态保存在每个客户端实例中；需要服务并发用户的调用方应按请求创建或配置客户端。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 公共类型、HTTP 方法、错误类型和 SSE 解码器 |

</details>

<a id="further-exploration"></a>
## 进一步探索

- [元枢智能体工具](../yuanshu-tool/README.zh.md) — 向 Agent 暴露智能体执行能力。
- [元枢问答工具](../yuanshu-qa-tool/README.zh.md) — 向 Agent 暴露知识问答能力。

<a id="model-experience"></a>
## 模型体验

无，因为 HTTP 客户端库不会注册工具、提示或会话事件。

#### KV Cache 影响

该库不会构造模型请求，也不会改变提供方缓存的复用行为。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **不会自动重试** — 网络错误和非成功响应的重试决策由调用方负责。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
