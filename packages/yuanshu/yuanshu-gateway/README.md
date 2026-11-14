---
description: "Let browser plugins call selected YuanShu worker and knowledge APIs through the Harness web server on the same origin."
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-gateway

English | [中文](README.zh.md)

## Summary

Mount this plugin to connect DSH browser features to YuanShu. Enterprise tools use the official MCP client with a user-scoped OAuth grant by default; the same-origin routes expose login and selected HTTP operations such as tenant selection and file transfer.

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

Choose the gateway for browser-side YuanShu access. Set `enterpriseTransport: legacy-http` only during an explicit rollback window; MCP failures never fall back to HTTP.

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
| `prefix` | `/yuanshu-api` | Same-origin route prefix |
| `enterpriseTransport` | `mcp` | `mcp` for user-authorized enterprise capabilities; `legacy-http` for explicit rollback |
| `mcpClientId` | `dsh-yuanshu` | Registered public OAuth client identifier |
| `mcpIssuer` | derived from `baseURL` | Expected authorization server issuer |
| `mcpResource` | derived from `baseURL` | Protected MCP resource URL |
| `mcpRedirectUri` | loopback callback | Registered Authorization Code + PKCE callback |

See the generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-yuanshu-gateway) for the accepted fields.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The gateway keeps MCP grants scoped to the authenticated DSH user and selected tenant. MCP discovery, issuer/resource checks, refresh, and revoke are handled by the user-scoped client; a platform login token or instance-wide bearer token is not accepted as MCP authorization.

Overlapping requests with the same login and tenant share one MCP client and discovery operation. Each protocol request reads the current grant; the final request releases the client, and plugin disposal closes active clients. Different users, tenants, and plugin instances never share a client.

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
