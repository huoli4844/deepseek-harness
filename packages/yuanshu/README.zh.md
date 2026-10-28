---
description: "元枢平台包组让 Harness 部署通过共享 HTTP 客户端和专用插件调用平台智能体与知识服务。"
kind: "package-group"
---

# yuanshu/ — 元枢平台集成

[English](README.md) | 中文

## 概述

使用这些包可以从 Harness 工具或浏览器会话视图调用元枢智能体与知识 API。客户端负责 HTTP 请求和响应解码；网关、工具和登录服务器分别服务于不同的部署需求。这些包不提供或运行元枢后端。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

根据调用元枢的平台界面选择对应的包。

| Package | Role |
|---|---|
| [`yuanshu-client`](yuanshu-client/README.zh.md) | 向元枢发送 HTTP 和 SSE 请求。 |
| [`yuanshu-gateway`](yuanshu-gateway/README.zh.md) | 通过 Harness Web 服务器暴露选定的元枢操作。 |
| [`yuanshu-login-server`](yuanshu-login-server/README.zh.md) | 提供元枢登录页及其构建产物。 |
| [`yuanshu-tool`](yuanshu-tool/README.zh.md) | 为 Agent 添加智能体执行工具。 |
| [`yuanshu-qa-tool`](yuanshu-qa-tool/README.zh.md) | 为 Agent 添加知识问答工具。 |

<a id="related-documentation"></a>
## 相关文档

- [HTTP 服务器](../../docs/subsystems/web-server.zh.md) — 网关和登录服务器使用的路由注册机制。
- [添加包](../../docs/cookbook/adding-a-package.zh.md) — 包导出、配置和 README 要求。

<a id="dev-note"></a>
## 开发备注

无。
