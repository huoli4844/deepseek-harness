---
description: "Let browser plugins call selected YuanShu worker and knowledge APIs through the Harness web server on the same origin."
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-gateway

English | [中文](README.zh.md)

## Summary

Mount this plugin when a browser feature needs selected YuanShu APIs without making cross-origin requests to the platform. The gateway forwards worker execution, knowledge Q&A, tenant, and capability calls through the Harness web server. It accepts a request bearer token or a configured server-side default.

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

Add the package as a Cordis plugin and configure the upstream URL.

### When to choose it

Choose the gateway for browser-side calls that need same-origin transport. Server-side plugins can call [`yuanshu-client`](../yuanshu-client/README.md) directly.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-yuanshu-gateway'
  config:
    baseURL: http://localhost:8081
    prefix: /yuanshu-api
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | required | YuanShu API base URL |
| `token` | unset | Default bearer token when the request has no authorization header |
| `prefix` | `/yuanshu-api` | Same-origin route prefix |

See the generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-yuanshu-gateway) for the accepted fields.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The route creates a YuanShu client for each request so one browser user's bearer token or tenant header cannot change another request's credentials. The route owns only the selected API paths; it does not expose a generic upstream proxy.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Route registration, token resolution, and response forwarding |

</details>

<a id="further-exploration"></a>
## Further Exploration

- [YuanShu client](../yuanshu-client/README.md) — direct HTTP and SSE calls.
- [YuanShu chat view](../../client/ui-yuanshu-chat/README.md) — browser consumer of this route.

<a id="model-experience"></a>
## Model Experience

None, as the HTTP routes do not register model tools, prompts, or session events.

#### KV Cache effect

The gateway does not construct model requests or change provider cache reuse.

## Known Limitations and Deferred Work

- **Selected routes only** — callers cannot use this plugin as a general YuanShu API proxy.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
