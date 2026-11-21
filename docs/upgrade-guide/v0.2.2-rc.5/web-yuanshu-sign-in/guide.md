---
kind: upgrade-guide
description: "The Web profile opens the YuanShu sign-in page instead of exchanging a launch token at the app entry."
---

# The Web profile opens YuanShu sign-in

English | [中文](guide.zh.md)

## Change

The default Web profile prints and opens `/login`, where a user signs in with YuanShu. The previous startup URL opened the app and established a browser session with the launch token. The new sign-in page uses `http://localhost:8081` as the YuanShu API URL by default.

## Migration

1. For YuanShu deployments, set `yuanshu-login-server.config.yuanshuApiUrl` in `$DSH_HOME/profiles/web/cordis.patch.yml` to the API URL reachable from the browser and Host. Restart `dsh web` and confirm the printed URL opens the YuanShu sign-in page.
2. To retain launch-token entry, set `web-runtime.config.openLogin` to `false` and disable the `yuanshu-login-server` row in the same patch. Restart `dsh web` and confirm the printed app URL establishes a browser session.
