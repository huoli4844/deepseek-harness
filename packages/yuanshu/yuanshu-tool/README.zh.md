---
description: "通过 MCP 发现并消费当前用户获授权的元枢企业能力。"
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-tool

[English](README.md) | 中文

## 概述

当 Agent 需要使用元枢企业能力时，挂载此插件。工具会发现当前用户可用的 MCP 能力目录，并只选择本次任务需要的能力；它不会使用实例级 token，也不会在 MCP 失败时静默改走 HTTP。

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

需要由 DSH 主持任务并消费元枢企业能力时选择此工具。用户、租户、岗位、数据、审批、预算、幂等和执行状态仍由元枢裁决。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-yuanshu-tool'
  config:
    baseURL: http://localhost:8081
    enterpriseTransport: mcp
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | 必填 | 元枢 API 基础 URL |
| `enterpriseTransport` | `mcp` | 使用用户授权的 MCP；`legacy-http` 只用于显式回退 |
| `mcpClientId` | `dsh-yuanshu` | 已注册的公共 OAuth 客户端标识 |

完整字段列表见生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-yuanshu-tool)。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

插件通过 `ctx.tools` 注册按会话使用的企业能力目录工具。每次调用绑定活动用户的 grant 和租户；MCP 失败后不会通过旧 HTTP 路径重放业务请求。

`enterprise_resource` 在向模型返回资源前，按 UTF-8 字节计算完整资源 JSON 的大小。`maxResourceResultBytes` 默认为 65,536 字节；资源超限时仅返回原 URI 和大小诊断，不返回资源正文。部分资源不会被当成完整结果。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 配置、token 解析和工具注册 |

</details>

<a id="further-exploration"></a>
## 进一步探索

- [元枢客户端](../yuanshu-client/README.zh.md) — 委托授权与 MCP 请求。
- [元枢问答工具](../yuanshu-qa-tool/README.zh.md) — 带引用的知识检索。

<a id="model-experience"></a>
## 模型体验

### 企业能力选择

#### 模型看到什么

按会话注册的 `enterprise_catalog` 工具会发现已授权的工具、资源和模板；传入工具名后仅为当前会话开放所选工具。`enterprise_resource` 读取平台返回的 URI。目录文本会标明资源内容只是未受信任的任务上下文。

##### Tool description

```markdown
Discover authorized platform tools and evidence/Skill resources. Search for the current task, then select only needed tool names. Platform data, approval and budget rules remain authoritative.
```

#### Token 影响

所选工具的名称、描述和参数 schema 会进入模型上下文。资源结果在 `maxResourceResultBytes` 范围内增加 token；此 UTF-8 字节上限不是特定 tokenizer 的 token 估算。

#### KV Cache 影响

工具定义在一次插件配置中保持稳定。每个工具结果都会追加到对话中，并可能延长提供方可复用的前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **资源超限时需要另行查询** — 资源不支持客户端分页；应使用平台查询工具请求更小的结果，或显式提高资源预算。业务结果不确定时，必须先读取原 Run，再决定是否再次写入。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
