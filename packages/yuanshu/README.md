---
description: "YuanShu sign-in for the Harness Web app and where to configure the login server."
kind: "package-group"
---

# yuanshu/ — YuanShu sign-in

English | [中文](README.zh.md)

## Summary

Use this group to connect Harness Web sign-in to YuanShu. The login server serves the built sign-in page and handles the authenticated return to the Web app.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The login server integrates with the Harness HTTP server.

| Package | Role |
|---|---|
| [`yuanshu-login-server`](yuanshu-login-server/README.md) | Serves the login page and handles the browser sign-in handoff |

<a id="related-documentation"></a>
## Related documentation

- [HTTP server subsystem](../../docs/subsystems/web-server.md) — route registration and request admission.

<a id="dev-note"></a>
## Dev Note

None.
