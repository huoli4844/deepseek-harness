---
description: "为 Agent 提供知识问答工具，返回元枢答案、引用和检索元数据。"
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-qa-tool

[English](README.md) | 中文

## 概述

此包是旧 HTTP 兼容工具，在元枢 profile 中默认禁用。新的企业知识检索使用 `yuanshu-tool` 提供的用户授权 MCP 目录和证据资源。

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

仅当部署显式保留其 HTTP 端点且提供用户级 token 时保留此插件。MCP 企业通道不得配置实例级 token。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-yuanshu-qa-tool'
  config:
    baseURL: http://localhost:8081
    streaming: false
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | 必填 | 元枢 API 基础 URL |
| `token` | 未设置 | 旧 HTTP 路径显式提供的 Bearer token；不读取环境变量或 token 文件 |
| `streaming` | `false` | 读取完整 SSE 响应后再返回最终答案 |

完整字段列表见生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-yuanshu-qa-tool)。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

插件通过 `ctx.tools` 注册 `yuanshu_qa`，其注册 disposer 由插件 fiber 持有。它会将答案和引用元数据格式化为文本并返回给工具调用方。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 配置、请求处理、结果格式化和工具注册 |

</details>

<a id="further-exploration"></a>
## 进一步探索

- [元枢客户端](../yuanshu-client/README.zh.md) — HTTP、SSE 和取消行为。
- [元枢智能体工具](../yuanshu-tool/README.zh.md) — 通用智能体执行。

<a id="model-experience"></a>
## 模型体验

### 知识问答

#### 模型看到什么

工具名称为 `yuanshu_qa`。它接收 `question`，并可选接收 `session_id`、`collection_ids`、`application_id` 和 `thinking_mode`。结果以 `ANSWER:` 开头，并可附加引用、系统事实和诊断部分。工具描述为：

##### Tool description

```markdown
Query the YuanShu knowledge base for intelligent Q&A. Supports multi-turn conversation via session_id, scoped retrieval via collection_ids, and configurable thinking depth. Returns answers with citations.
```

##### Result headings

```markdown
ANSWER:
CITATIONS:
SYSTEM FACTS:
DIAGNOSTICS:
```

#### Token 影响

向模型公开工具时会包含工具描述和 schema。答案、引用和可选诊断会根据响应长度增加 token；每条引用摘要最多保留 200 个字符。

#### KV Cache 影响

工具定义在一次插件配置中保持稳定。每个结果都会追加到对话中，并可能延长提供方可复用的前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **流式结果会先被收集** — 设置 `streaming: true` 时会读取完整 SSE 流，然后只向模型返回已完成的结果。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
