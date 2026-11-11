---
description: "Show the signed-in YuanShu account in the sidebar footer and let the user reopen the YuanShu sign-in page."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-yuanshu-account

English | [中文](README.zh.md)

## Summary

Mount this browser plugin when YuanShu is the deployment's identity provider. It occupies the single `settings.launcher` sidebar slot, renders the YuanShu nickname and avatar, and reads the profile from the same-origin `/yuanshu-api/user/me` gateway route. The Harness login server publishes `__DSH_EXTERNAL_IDENTITY__` so the DeepSeek account plugin keeps its settings surfaces but yields the launcher slot.

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

Add the package to a Client composition that also includes the settings shell, locale services, and the YuanShu login server.

### When to choose it

Choose this launcher when users authenticate through YuanShu. Leave it out when the deployment uses DeepSeek account sign-in instead.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-client-ui-yuanshu-account'
```

The launcher has no plugin configuration. It expects the Host to serve the same-origin YuanShu gateway and the login page that stores `yuanshu-token` and `yuanshu-user` in `localStorage`.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers its locale dictionary and claims `settings.launcher` through the slot registry. The cached profile renders on the first frame; the gateway response replaces it once available. Failures degrade to a plain “YuanShu account” label and never block the workspace.

| File | Role |
|---|---|
| [`src/client/apply.tsx`](src/client/apply.tsx) | Locale registration and launcher slot claim |
| [`src/client/YuanShuAccountLauncher.tsx`](src/client/YuanShuAccountLauncher.tsx) | Avatar trigger, profile loading, and account menu |
| [`src/client/profile.ts`](src/client/profile.ts) | Token lookup, cached profile, and gateway request |

</details>

<a id="further-exploration"></a>
## Further Exploration

- [YuanShu login server](../../yuanshu/yuanshu-login-server/README.md) — sign-in page and identity marker.
- [YuanShu gateway](../../yuanshu/yuanshu-gateway/README.md) — same-origin `/user/me` route.

<a id="model-experience"></a>
## Model Experience

None, as the launcher registers no model tools, prompts, or session events.

#### KV Cache effect

The launcher does not construct model requests or change provider cache reuse.

## Known Limitations and Deferred Work

- **Host integration required** — the launcher needs the same-origin gateway and the login page's stored token; without them it shows the fallback label.
- **Single identity** — the launcher assumes YuanShu owns the sidebar identity entry; DeepSeek account sign-in stays available only through the settings page.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
