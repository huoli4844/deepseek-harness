---
description: "在 Node 或浏览器代码中调用元枢智能体与知识 API，支持 JSON 响应、认证、租户选择和 SSE 解码。"
kind: "package-library"
---

# @deepseek-ai/dsh-yuanshu-client

[English](README.md) | 中文

## 概述

用户授权的企业能力通过 `YuanShuMcp` 和官方 MCP 协议调用。`YuanShuClient` 保留用于登录、租户、文件及显式旧 HTTP 操作；两个客户端都不会注册 Harness 工具或 Cordis 服务。

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

企业能力使用 `YuanShuMcp` 发现 MCP 目录、读取资源、订阅更新并调用工具。仅剩余 HTTP 操作或明确选择回退传输时使用 `YuanShuClient`。

### 入口

```ts
import { YuanShuClient } from '@deepseek-ai/dsh-yuanshu-client'

const client = new YuanShuClient({ baseURL: 'http://localhost:8081' })
const capabilities = await client.listCapabilities()
```

`listCapabilities()` 会自动遍历元枢的分页信封（`list/total/page/page_size`），也兼容旧网关直接返回数组的响应。调用成功时返回解码后的能力列表；HTTP 错误和元枢错误响应会以 `YuanShuError` 拒绝，不会把权限失败伪装成空能力列表。方法和取消行为详见 [`src/index.ts`](src/index.ts)。

配置企业 MCP 客户端后，`listCapabilities()` 和 `listScenarios()` 通过 MCP 仅发现已发布的专业 Agent 安全描述及不可变修订。专业目录沿递增的 `next_after_id` 游标读取，包括过滤后的空页，最多 64 页；目录不完整或无效时显式失败。`scenarios_list` 表示该专业目录；`scenario_bindings_list` 发现选定 Agent 绑定的工作流及版本。确定性工作流使用 `scenario_run`，专业子任务使用 `agent_delegate`。两者均保留平台 Run 句柄，重连后据此查询结果或请求取消。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

`YuanShuMcp` 基于官方 MCP 客户端实现 OAuth resource 发现、PKCE issuer 校验、按用户隔离 grant、刷新和撤销。`YuanShuClient` 处理剩余 HTTP 请求，不提供 MCP 凭据。

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

- **不会自动重试业务操作** — SDK 只会在认证拒绝后刷新凭据并重试一次；网络错误、已受理 Run 和结果未知的业务操作由调用方决定是否重试。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

按需执行的[知识问答探针](tests/knowledge-live-probe.ts)使用可清理的平台测试账号和正常 OAuth 授权，核验新生成的模型答案、原文引用及持久化问答记录。它要求显式配置本地平台和模型；缓存答案与规则回退均不能通过此检查。

</details>
