---
description: "Serve the YuanShu login page and static assets from the Harness web server so browser users can authenticate on the app origin."
kind: "package-reference"
---

# @deepseek-ai/dsh-yuanshu-login-server

English | [中文](README.zh.md)

## Summary

Mount this plugin to serve the built YuanShu login page from the Harness web server. The page authenticates against the configured YuanShu API URL, stores the browser token, and returns to the Harness app. The return URL is issued only to an already authenticated Harness browser session. The frontend must be built before the login route can serve its page.

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

Add the plugin to a composition with a reachable web server and a built login frontend.

### When to choose it

Choose this plugin when a deployment needs a same-origin login page. The YuanShu backend remains a separate service.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-yuanshu-login-server'
  inject: [webServer, connection, webApp]
  config:
    yuanshuApiUrl: http://localhost:8081
```

| Field | Default | Meaning |
|---|---|---|
| `loginDist` | package-resolved app `dist` directory | Built login page and assets |
| `yuanshuApiUrl` | `http://localhost:8081` | YuanShu backend URL injected into the login page |

See the generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-yuanshu-login-server) for the accepted fields.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin owns four web-server registrations for the login page, its assets, the favicon, and the authenticated browser handoff. The handoff rejects requests without a valid Harness browser session and adds the process token to the advertised app URL. Cordis effects release each route when the plugin unloads.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Static page serving and route registration |

</details>

<a id="further-exploration"></a>
## Further Exploration

- [YuanShu gateway](../yuanshu-gateway/README.md) — same-origin API calls from the browser.
- [Login frontend](../../../apps/yuanshu-login/README.md) — build and authentication flow.

<a id="model-experience"></a>
## Model Experience

None, as the login page and its static assets do not register model-facing behavior.

#### KV Cache effect

The plugin does not construct model requests or change provider cache reuse.

## Known Limitations and Deferred Work

- **The page requires built assets** — a missing `index.html` returns an HTTP 500 response from `/login`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
