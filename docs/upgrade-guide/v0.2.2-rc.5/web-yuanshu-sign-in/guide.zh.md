---
kind: upgrade-guide
description: "Web profile 打开元枢登录页，取代在应用入口交换启动令牌。"
---

# Web profile 打开元枢登录页

[English](guide.md) | 中文

## 变更

默认的 Web profile 打印并打开 `/login`，用户在此登录元枢。此前的启动 URL 会先打开应用，再通过启动令牌建立浏览器会话。新的登录页默认使用 `http://localhost:8081` 作为元枢 API 地址。

## 迁移

1. 使用元枢的部署须在 `$DSH_HOME/profiles/web/cordis.patch.yml` 中将 `yuanshu-login-server.config.yuanshuApiUrl` 设为浏览器和 Host 均可访问的 API 地址。重启 `dsh web`，确认输出的 URL 打开元枢登录页。
2. 若要保留启动令牌入口，在同一个补丁中将 `web-runtime.config.openLogin` 设为 `false`，并禁用 `yuanshu-login-server` 配置项。重启 `dsh web`，确认输出的应用 URL 可建立浏览器会话。
