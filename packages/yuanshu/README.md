---
description: "The YuanShu package group lets Harness deployments call platform workers and knowledge services through a shared HTTP client and focused plugins."
kind: "package-group"
---

# yuanshu/ — YuanShu platform integration

English | [中文](README.zh.md)

## Summary

Use these packages to call YuanShu worker and knowledge APIs from Harness tools or a browser conversation view. The client owns HTTP requests and response decoding; the gateway, tools, and login server each serve a separate deployment need. The packages do not provide or operate the YuanShu backend.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Choose the package for the surface that calls YuanShu.

| Package | Role |
|---|---|
| [`yuanshu-client`](yuanshu-client/README.md) | Sends HTTP and SSE requests to YuanShu. |
| [`yuanshu-gateway`](yuanshu-gateway/README.md) | Exposes selected YuanShu operations through the Harness web server. |
| [`yuanshu-login-server`](yuanshu-login-server/README.md) | Serves the YuanShu login page and its built assets. |
| [`yuanshu-tool`](yuanshu-tool/README.md) | Adds a worker-execution tool to the Agent. |
| [`yuanshu-qa-tool`](yuanshu-qa-tool/README.md) | Adds a knowledge Q&A tool to the Agent. |

<a id="related-documentation"></a>
## Related documentation

- [HTTP server](../../docs/subsystems/web-server.md) — route registration used by the gateway and login server.
- [Adding a package](../../docs/cookbook/adding-a-package.md) — package exports, configuration, and README requirements.

<a id="dev-note"></a>
## Dev Note

None.
