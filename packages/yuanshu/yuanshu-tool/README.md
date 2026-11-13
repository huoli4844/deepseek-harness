---
description: "Discover and consume user-authorized YuanShu enterprise capabilities through MCP."
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-tool

English | [中文](README.zh.md)

## Summary

Mount this plugin when an Agent needs YuanShu enterprise capabilities. The tool discovers the current user's authorized MCP catalog and selects only the requested capabilities; it does not use an instance token or silently retry through HTTP.

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

Choose this tool for DSH-hosted tasks that consume YuanShu enterprise capabilities. The platform remains authoritative for user, tenant, role, data, approval, budget, idempotency, and execution state.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-yuanshu-tool'
  config:
    baseURL: http://localhost:8081
    enterpriseTransport: mcp
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | required | YuanShu API base URL |
| `enterpriseTransport` | `mcp` | Use user-authorized MCP; `legacy-http` is an explicit rollback setting |
| `mcpClientId` | `dsh-yuanshu` | Registered public OAuth client identifier |

See the generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-yuanshu-tool) for the accepted fields.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers a session-scoped enterprise catalog tool. Each call is bound to the active user's grant and tenant; MCP failures are returned without replaying a business request through the legacy HTTP path.

`enterprise_resource` measures the complete resource JSON in UTF-8 bytes before returning it to the model. `maxResourceResultBytes` defaults to 65,536 bytes; oversized resources return a diagnostic with the original URI and size, without resource content. No partial resource is presented as complete.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Configuration, token resolution, and tool registration |

</details>

<a id="further-exploration"></a>
## Further Exploration

- [YuanShu client](../yuanshu-client/README.md) — delegated authorization and MCP requests.
- [YuanShu Q&A tool](../yuanshu-qa-tool/README.md) — knowledge retrieval with citations.

<a id="model-experience"></a>
## Model Experience

### Enterprise capability selection

#### What the model sees

The session-scoped `enterprise_catalog` tool discovers authorized tools, resources, and templates; selecting names exposes only those tools for the current session. `enterprise_resource` reads a URI returned by the platform. The catalog text marks resource content as untrusted task context.

##### Tool description

```markdown
Discover authorized platform tools and evidence/Skill resources. Search for the current task, then select only needed tool names. Platform data, approval and budget rules remain authoritative.
```

#### Token effect

Selected tool names, descriptions and parameter schemas enter the model context. Resource results add tokens within `maxResourceResultBytes`; this UTF-8 byte limit is not a tokenizer-specific token estimate.

#### KV Cache effect

The tool definition stays stable for one plugin configuration. Each tool result is appended to the conversation and can extend the provider's reusable prefix.

## Known Limitations and Deferred Work

- **Oversized resources require another query** — resources have no client-side paging; request a smaller result with the platform query tools or explicitly increase the resource budget. Unknown business outcomes require reading the original Run before another write.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
