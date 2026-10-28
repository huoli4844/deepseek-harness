---
description: "Give the Agent a knowledge Q&A tool that returns YuanShu answers with citation and retrieval metadata."
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-qa-tool

English | [中文](README.zh.md)

## Summary

Mount this plugin when the Agent needs to query YuanShu knowledge collections and receive an answer with citations. The tool supports follow-up session ids, collection filters, application selection, and thinking depth. It returns a plain-text answer; citation links are not rendered as a rich card.

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

Choose this plugin when the task requires knowledge retrieval, citations, or a continuing Q&A session. Use [`yuanshu-tool`](../yuanshu-tool/README.md) for general worker execution.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-yuanshu-qa-tool'
  config:
    baseURL: http://localhost:8081
    streaming: false
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | required | YuanShu API base URL |
| `token` | unset | Optional bearer token; otherwise the plugin checks `YUANSHU_TOKEN` and `~/.dsh/yuanshu-token` |
| `streaming` | `false` | Read the SSE endpoint before returning the final answer |

See the generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-yuanshu-qa-tool) for the accepted fields.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers `yuanshu_qa` through `ctx.tools`; the registration disposer is owned by the plugin fiber. It formats the answer and citation metadata as text for the tool result.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Configuration, request handling, output formatting, and tool registration |

</details>

<a id="further-exploration"></a>
## Further Exploration

- [YuanShu client](../yuanshu-client/README.md) — HTTP, SSE, and cancellation behavior.
- [YuanShu worker tool](../yuanshu-tool/README.md) — general worker execution.

<a id="model-experience"></a>
## Model Experience

### Knowledge question

#### What the model sees

The tool is named `yuanshu_qa`. It accepts `question` plus optional `session_id`, `collection_ids`, `application_id`, and `thinking_mode`. Its result starts with `ANSWER:` and can add citation, system fact, and diagnostic sections. Its description is:

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

#### Token effect

The tool description and schema enter model context when tools are exposed. The answer, citations, and optional diagnostics add tokens according to the response size; each citation preview is capped at 200 characters.

#### KV Cache effect

The tool definition stays stable for one plugin configuration. Each result is appended to the conversation and can extend the provider's reusable prefix.

## Known Limitations and Deferred Work

- **Streaming is collected before return** — setting `streaming: true` reads the full SSE stream and returns only the completed result to the model.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
