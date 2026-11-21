---
description: "Harness Web 应用的元枢登录，以及登录服务的配置入口。"
kind: "package-group"
---

# yuanshu/ — 元枢登录

[English](README.md) | 中文

## 概要

通过此分组将 Harness Web 登录接入元枢。登录服务提供构建后的登录页，并处理认证后返回 Web 应用的流程。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

登录服务接入 Harness HTTP 服务器。

| 包 | 职责 |
|---|---|
| [`yuanshu-login-server`](yuanshu-login-server/README.zh.md) | 提供登录页并处理浏览器登录交接 |

<a id="related-documentation"></a>
## 相关文档

- [HTTP 服务器子系统](../../docs/subsystems/web-server.zh.md) — 路由注册和请求准入。

<a id="dev-note"></a>
## 开发备注

无。
