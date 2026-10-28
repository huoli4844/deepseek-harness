---
description: "Add a browser conversation tab for asking YuanShu knowledge questions through a same-origin Harness gateway."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-yuanshu-chat

English | [中文](README.zh.md)

## Summary

Mount this browser plugin to ask YuanShu knowledge questions from a conversation tab. It sends requests to the same-origin `/yuanshu-api` gateway and reads the browser token from `localStorage.yuanshu-token`. The YuanShu gateway must be mounted in the Host profile.

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

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

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
