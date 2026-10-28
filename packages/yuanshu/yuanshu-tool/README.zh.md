---
description: "为 Agent 提供工具，将任务发送给已配置的元枢智能体并返回执行结果。"
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-tool

[English](README.md) | 中文

## 概述

当 Agent 需要将任务委派给元枢智能体时，挂载此插件。工具会以文本形式返回平台响应，并允许指定智能体类型和会话 ID。网络或平台错误会以可诊断的元枢错误拒绝此次工具调用。

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

将插件与 `dsh-tools` 一起加载，并配置可访问的元枢端点。

### 何时选择

需要通用元枢智能体执行时选择此工具。需要知识检索和引用时使用 [`yuanshu-qa-tool`](../yuanshu-qa-tool/README.zh.md)。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-yuanshu-tool'
  config:
    baseURL: http://localhost:8081
    defaultWorkerType: general_assistant
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | 必填 | 元枢 API 基础 URL |
| `token` | 未设置 | 可选 Bearer token；否则依次读取 `YUANSHU_TOKEN` 和 `~/.dsh/yuanshu-token` |
| `defaultWorkerType` | `general_assistant` | 模型未提供 `worker_type` 时使用的智能体类型 |

完整字段列表见生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-yuanshu-tool)。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

插件通过 `ctx.tools` 注册 `yuanshu_agent`，其注册 disposer 由插件 fiber 持有。插件在启动时解析一个 token，并在该插件实例发起的请求中复用它。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 配置、token 解析和工具注册 |

</details>

<a id="further-exploration"></a>
## 进一步探索

- [元枢客户端](../yuanshu-client/README.zh.md) — HTTP 和 SSE 行为。
- [元枢问答工具](../yuanshu-qa-tool/README.zh.md) — 带引用的知识检索。

<a id="model-experience"></a>
## 模型体验

### YuanShu worker execution

#### 模型看到什么

工具名称为 `yuanshu_agent`。它接收必填的 `task`、可选的 `worker_type` 和可选的 `session_id`；输出是序列化为文本的元枢执行结果。提供给模型的描述为：

##### Tool description

```markdown
Forward a question to YuanShu platform agent (智能问数Agent, 知识库问答Agent, etc.) and get the answer. Use this when you need to query data or get knowledge-based answers from the YuanShu platform.
```

#### Token 影响

向模型公开工具时会包含工具名称、描述和参数 schema。返回结果会根据平台响应的长度增加 token。

#### KV Cache 影响

工具定义在一次插件配置中保持稳定。每个工具结果都会追加到对话中，并可能延长提供方可复用的前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **没有内建重试或超时策略** — 模型可见的工具调用会等待元枢 HTTP 请求完成，插件不会重试失败的请求。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
