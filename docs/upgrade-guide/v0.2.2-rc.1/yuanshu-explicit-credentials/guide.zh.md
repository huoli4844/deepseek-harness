---
kind: upgrade-guide
description: "元枢网关与 agent 工具必须显式提供凭据，不再从共享文件或环境变量读取。"
---

# 显式配置元枢网关与 agent 工具凭据

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-yuanshu-gateway` 与 `@deepseek-ai/dsh-yuanshu-tool` 不读取 `YUANSHU_TOKEN` 或 `~/.dsh/yuanshu-token`。网关使用逐请求 bearer token，仅回退到已配置的 `token`。agent 工具只在自身配置了 `token` 时注册。网页登录保存浏览器凭据，不下载 CLI token 文件。独立的 `yuanshu-qa-tool` 凭据解析保持不变。

## 迁移

1. 浏览器用户通过 `/login` 登录；工作台随每次网关请求发送已保存的 token。
2. CLI agent 工具用户在 profile 的 `cordis.patch.yml` 中，为 `yuanshu-tool` 条目设置 `config.token`。不要把凭据值提交到版本控制。
3. 网关部署若需要共享默认凭据，在 `yuanshu-gateway` 上显式设置 `config.token`；请求 bearer token 优先。
4. 确认已登录浏览器能加载工作台，并且已配置的 agent 工具调用使用预期的元枢账号。
