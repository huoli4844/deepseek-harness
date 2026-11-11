---
kind: upgrade-guide
description: "YuanShu gateway and agent-tool credentials must be supplied explicitly instead of read from shared files or environment variables."
---

# Explicit YuanShu gateway and agent-tool credentials

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-yuanshu-gateway` and `@deepseek-ai/dsh-yuanshu-tool` do not read `YUANSHU_TOKEN` or `~/.dsh/yuanshu-token`. The gateway uses each request's bearer token, falling back only to its configured `token`. The agent tool registers only when its own `token` is configured. Browser sign-in stores browser credentials and does not download a CLI token file. The separate `yuanshu-qa-tool` credential resolution is unchanged.

## Migration

1. For browser use, sign in through `/login`; the workbench sends the stored token with each gateway request.
2. For CLI agent-tool use, set `config.token` on the `yuanshu-tool` entry in your profile's `cordis.patch.yml`. Keep credential values out of version control.
3. If a gateway deployment needs a shared default, set `config.token` explicitly on `yuanshu-gateway`; request bearer tokens take priority.
4. Confirm that a signed-in browser can load the workbench and that a configured agent-tool invocation uses the intended YuanShu account.
