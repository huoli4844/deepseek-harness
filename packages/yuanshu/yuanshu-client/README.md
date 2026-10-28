---
description: "Call YuanShu worker and knowledge APIs from Node or browser code with JSON responses, authentication, tenant selection, and SSE decoding."
kind: "package-library"
---

# @deepseek-ai/dsh-yuanshu-client

English | [中文](README.zh.md)

## Summary

Use `YuanShuClient` to call YuanShu worker, tenant, capability, and knowledge endpoints from a package that owns the user-facing operation. The client accepts an injected `fetch` implementation for controlled transports and tests. It does not register a Harness tool or Cordis service.

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

Use the client from a plugin that needs YuanShu HTTP or SSE operations; mount a plugin such as `yuanshu-tool` when the Agent should call those operations.

### Entry point

```ts
import { YuanShuClient } from '@deepseek-ai/dsh-yuanshu-client'

const client = new YuanShuClient({ baseURL: 'http://localhost:8081' })
const capabilities = await client.listCapabilities()
```

`listCapabilities()` traverses YuanShu pagination envelopes (`list/total/page/page_size`) and accepts legacy gateways that return arrays directly. Successful calls return the decoded capability list; HTTP failures and YuanShu error envelopes reject with `YuanShuError` rather than returning an empty list for a permission failure. See [`src/index.ts`](src/index.ts) for method and cancellation details.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The client centralizes URL joining, bearer and tenant headers, JSON envelope handling, and SSE decoding. It keeps authentication state on each client instance; consumers that serve concurrent users should create or configure clients per request.

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

- **No automatic retries** — callers own retry decisions for network errors and non-success responses.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
