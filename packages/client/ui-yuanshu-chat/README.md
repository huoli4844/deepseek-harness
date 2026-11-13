---
description: "Add a YuanShu workbench panel and conversation tab for ontology, capabilities, scenarios, DAGs, knowledge and Q&A over a same-origin Harness gateway."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-yuanshu-chat

English | [中文](README.zh.md)

## Summary

Mount this browser plugin to consume the YuanShu platform's authenticated MCP capability catalog and application workbench. It sends requests to the same-origin `/yuanshu-api` gateway and reads the login token from `localStorage.yuanshu-token`; the gateway owns the separate user and tenant MCP grant. The YuanShu gateway must be mounted in the Host profile.

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

Add the package to a Client composition that also includes the conversation slots and locale services.

### When to choose it

Choose this view for browser-based knowledge Q&A. The model-facing [`yuanshu_qa` tool](../../yuanshu/yuanshu-qa-tool/README.md) is separate and can be used without this view.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-client-ui-yuanshu-chat'
```

The view has no plugin configuration. It expects the Host to serve the login page and same-origin gateway routes.

Select a tenant and explicitly authorize enterprise access. Tool results refresh the original Run without reloading identity or the capability catalog. Refresh, tenant selection, authorization and revocation reload the catalog. Reload restores only the authenticated owner's original Run handle and queries the platform again; it never resubmits the business operation.

Large tables show a preview of up to 100 rows and 12 columns. Oversized objects and deeply nested values also show a preview notice and an explicit control to expand the complete returned JSON. The preview never changes the platform result or implies that a server-paginated response contains the whole dataset.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Original scenario handles restore through `scenario_run_get`; cancellation uses `scenario_run_cancel` so the platform can propagate it to the existing workflow nodes and execution queue. The view displays confirmed platform states and keeps no second business execution record.

The plugin registers its locale dictionary and injects a conversation view through the slot registry. The view sends SSE requests to the Host gateway and renders the completed answer and citations.

| File | Role |
|---|---|
| [`src/client/apply.tsx`](src/client/apply.tsx) | Locale, gateway client, and conversation view registration |
| [`src/client/ChatPanel.tsx`](src/client/ChatPanel.tsx) | Question entry, streamed request handling, and result display |

</details>

<a id="further-exploration"></a>
## Further Exploration

- [YuanShu gateway](../../yuanshu/yuanshu-gateway/README.md) — same-origin upstream routes.
- [YuanShu Q&A tool](../../yuanshu/yuanshu-qa-tool/README.md) — model-facing knowledge questions.

<a id="model-experience"></a>
## Model Experience

None, as the browser view registers no model tools, prompts, or session events.

#### KV Cache effect

The view does not construct model requests or change provider cache reuse.

## Known Limitations and Deferred Work

- **Host integration required** — the browser view cannot reach YuanShu unless the same-origin gateway is mounted and the login page has stored a browser token.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
