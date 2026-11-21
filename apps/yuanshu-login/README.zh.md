# 元枢平台登录页

[English](README.md) | 中文

由 Harness Web 应用中的元枢登录服务提供的 Vue 登录页面。

## 构建

```sh
pnpm --filter @deepseek-ai/yuanshu-login run build
```

工作区 Web 构建也会构建此应用。两种命令均写入 `dist/`，登录服务通过 `/login` 提供这些产物。

## 登录流程

1. 打开 Harness Web 应用，跟随登录重定向进入 `/login`。
2. 使用平台账号登录后，从元枢返回的可访问租户中选择工作台。使用租户账号时，先选择所属租户。两种方式都需要完成账号要求的二次验证。
3. 页面将 token 与账号资料存入浏览器存储，然后向 `/yuanshu-token` 发送 bearer token。
4. Host 向元枢验证该 token 后，页面跳转到返回的已认证 Harness URL。

交接失败时，页面显示错误并保留登录页。浏览器凭据保留在浏览器中；网页登录不会配置 CLI 工具。

## 浏览器存储

- `yuanshu-token` — 浏览器请求使用的 bearer token。
- `workbench-client-token` — 与现有浏览器客户端共享的 token 键。
- `yuanshu-user` — 侧栏账号入口缓存的用户名和昵称。
