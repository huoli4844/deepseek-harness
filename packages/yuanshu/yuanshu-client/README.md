---
description: "Call YuanShu worker and knowledge APIs from Node or browser code with JSON responses, authentication, tenant selection, and SSE decoding."
kind: "package-library"
---

# @deepseek-ai/dsh-yuanshu-client

English | [中文](README.zh.md)

## Summary

Use `YuanShuMcp` for user-authorized enterprise capabilities over the official MCP protocol. `YuanShuClient` remains for login, tenant, file, and explicit legacy HTTP operations; neither client registers a Harness tool or Cordis service.

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

### When to use it

Use `YuanShuMcp` for MCP discovery, resources, subscriptions, and enterprise tool calls. Use `YuanShuClient` only for the remaining HTTP operations or an explicitly selected rollback transport.

### Entry point

```ts
import { YuanShuClient } from '@deepseek-ai/dsh-yuanshu-client'

const client = new YuanShuClient({ baseURL: 'http://localhost:8081' })
const capabilities = await client.listCapabilities()
```

`listCapabilities()` traverses YuanShu pagination envelopes (`list/total/page/page_size`) and accepts legacy gateways that return arrays directly. Successful calls return the decoded capability list; HTTP failures and YuanShu error envelopes reject with `YuanShuError` rather than returning an empty list for a permission failure. See [`src/index.ts`](src/index.ts) for method and cancellation details.

With an enterprise MCP client configured, `listCapabilities()` and `listScenarios()` discover only published professional Agent descriptions and immutable revisions through MCP. Professional discovery follows advancing `next_after_id` cursors, including filtered empty pages, with a 64-page limit; incomplete or invalid catalogs fail explicitly. `scenarios_list` names this professional catalog; `scenario_bindings_list` discovers the versioned workflows bound to a selected Agent. Deterministic workflows use `scenario_run`, while `agent_delegate` starts a professional child task. Both retain a platform Run handle for reading outcomes and requesting cancellation after reconnect.

Execution results include the platform-owned `task_ref`; callers pass it unchanged to `task_get`, `task_result`, `task_events`, `task_cancel`, or `task_resume` as advertised by `available_operations`. Workflow and Action approvals use `task_approvals` and `task_approve`. These tools adapt the existing platform records; unsupported operations reject explicitly and unknown outcomes never trigger another execution.

Workbench collection reads require a selected ontology space: call `listOntologySpaces()`, then `listOntologyCollections(spaceId, limit?)`. `listOntologyReleases(limit?, spaceId?)` can filter releases to the same space.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`YuanShuMcp` wraps the official MCP client with OAuth resource discovery, PKCE issuer checks, per-user grants, refresh, and revocation. `YuanShuClient` centralizes the remaining HTTP request behavior and never supplies MCP credentials.

OAuth consent sends the explicitly selected tenant in both `X-Active-Tenant` and the authorization form so the platform can validate tenant membership before granting access. The console token and tenant header are confined to that consent request; subsequent MCP requests use the user and tenant scoped OAuth grant.

Concurrent `tools()` readers share only the in-flight catalog request within this client. Completion or failure clears that shared request; this layer does not extend server cache lifetimes or authorize a later execution.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Public types, HTTP methods, error type, and SSE decoder |

</details>

<a id="further-exploration"></a>
## Further Exploration

- [YuanShu worker tool](../yuanshu-tool/README.md) — expose worker execution to the Agent.
- [YuanShu Q&A tool](../yuanshu-qa-tool/README.md) — expose knowledge questions to the Agent.

<a id="model-experience"></a>
## Model Experience

None, as the HTTP client library registers no tools, prompts, or session events.

#### KV Cache effect

The library does not construct model requests or change provider cache reuse.

## Known Limitations and Deferred Work

- **No automatic business retries** — the SDK may refresh credentials once after an authentication rejection, but callers own retry decisions for network errors, accepted Runs, and unknown business outcomes.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The opt-in [knowledge probe](tests/knowledge-live-probe.ts) uses a disposable platform account and normal OAuth authorization to verify a fresh model answer, source citations, and the persisted Q&A turn. It requires an explicitly configured local platform and model; cached answers and rule fallbacks fail this check.

</details>
