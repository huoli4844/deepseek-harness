---
description: "Give the Agent a tool for sending a task to a configured YuanShu worker and returning its response."
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-tool

English | [中文](README.zh.md)

## Summary

Mount this plugin when the Agent needs to delegate a task to a YuanShu worker. The tool returns the platform response as text and accepts an optional worker type and session id. Network and platform failures reject the tool call with an actionable YuanShu error.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Add the plugin beside `dsh-tools` and configure a reachable YuanShu endpoint.

### When to choose it

Choose this tool for general YuanShu worker execution. Use [`yuanshu-qa-tool`](../yuanshu-qa-tool/README.md) when the task needs knowledge-base retrieval and citations.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-yuanshu-tool'
  config:
    baseURL: http://localhost:8081
    defaultWorkerType: general_assistant
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | required | YuanShu API base URL |
| `token` | unset | Optional bearer token; otherwise the plugin checks `YUANSHU_TOKEN` and `~/.dsh/yuanshu-token` |
| `defaultWorkerType` | `general_assistant` | Worker type when the model omits `worker_type` |

See the generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-yuanshu-tool) for the accepted fields.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers `yuanshu_agent` through `ctx.tools`; the registration disposer is owned by the plugin fiber. It resolves one token at setup and uses it for worker requests made by that plugin instance.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Configuration, token resolution, and tool registration |

</details>

<a id="further-exploration"></a>
## Further Exploration

- [YuanShu client](../yuanshu-client/README.md) — HTTP and SSE behavior.
- [YuanShu Q&A tool](../yuanshu-qa-tool/README.md) — knowledge retrieval with citations.

<a id="model-experience"></a>
## Model Experience

### YuanShu worker execution

#### What the model sees

The tool is named `yuanshu_agent`. It accepts a required `task`, an optional `worker_type`, and an optional `session_id`; the output contains the YuanShu worker response serialized as text. The description presented to the model is:

##### Tool description

```markdown
Forward a question to YuanShu platform agent (智能问数Agent, 知识库问答Agent, etc.) and get the answer. Use this when you need to query data or get knowledge-based answers from the YuanShu platform.
```

#### Token effect

The tool name, description, and parameter schema are included when tools are exposed to the model. The returned response adds tokens according to the platform result size.

#### KV Cache effect

The tool definition stays stable for one plugin configuration. Each tool result is appended to the conversation and can extend the provider's reusable prefix.

## Known Limitations and Deferred Work

- **No built-in retry or timeout policy** — the model-visible tool call waits on the YuanShu HTTP request, and the plugin does not retry a failed request.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
