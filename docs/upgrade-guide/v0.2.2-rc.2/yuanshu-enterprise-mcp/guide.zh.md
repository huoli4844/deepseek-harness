---
kind: upgrade-guide
description: "元枢企业能力现通过用户授权的 MCP 调用，不再使用实例级 HTTP 凭据。"
---

# 元枢企业能力改用 MCP 用户授权

[English](guide.md) | 中文

## 变更

元枢 profile 现在默认通过 MCP 调用企业能力，并要求当前 DSH 用户和租户拥有独立 OAuth grant。MCP 模式会拒绝实例级 Bearer token 和 token 文件回落；MCP 失败不会改走 HTTP 重放请求。

## 迁移

1. 从 `@deepseek-ai/dsh-yuanshu-gateway` 和 `@deepseek-ai/dsh-yuanshu-tool` 配置中移除 `token`。
2. 设置 `enterpriseTransport: mcp`；平台默认值不匹配时配置已注册的 `mcpClientId`、`mcpIssuer`、`mcpResource` 和本地回环 `mcpRedirectUri`，并在授权服务器登记该回调地址。
3. 将登录和文件传输 HTTP 配置与 MCP grant 分开，然后由每位 DSH 用户通过 Authorization Code + PKCE 完成授权。
4. 保持基础 bundle 的 `session-persistence-jsonl` provider 启用，使工作区、Session 控制器和本地恢复能够激活。仓库集成通过 `pnpm dsh web --patch apps/cli/config/profiles/yuanshu/cordis.patch.yml` 启动；该 patch 不是内置 profile 模板。
5. 确认网关返回 `enterpriseTransport: mcp`、用户可以发现其获授权工具，且第二位用户获得独立目录。
6. 仅在获准的回退窗口中设置 `enterpriseTransport: legacy-http` 并提供用户级 token；旧路径修复后恢复 MCP 模式。
