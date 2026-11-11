---
description: "在侧栏底部展示已登录的元枢账号，并提供重新打开元枢登录页的入口。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-yuanshu-account

[English](README.md) | 中文

## 概述

当元枢是部署的唯一身份提供方时挂载此浏览器插件。它占据唯一的 `settings.launcher` 侧栏槽位，展示元枢昵称与头像，并通过同源 `/yuanshu-api/user/me` 网关路由读取账号资料。Harness 登录服务会注入 `__DSH_EXTERNAL_IDENTITY__`，让 DeepSeek 账号插件保留设置页能力但让出该槽位。

## 目录

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将该包加入包含设置外壳、locale 服务与元枢登录服务的 Client 组合。

### 何时选择

用户通过元枢认证时选择此入口；使用 DeepSeek 账号登录的部署不要挂载它。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-client-ui-yuanshu-account'
```

该入口没有插件配置。Host 需要提供同源元枢网关，以及会把 `yuanshu-token` 与 `yuanshu-user` 写入 `localStorage` 的登录页。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

插件注册 locale 字典并通过 slot registry 占用 `settings.launcher`。首帧使用登录页缓存的资料，网关返回后覆盖；请求失败时降级为“元枢账号”，不阻断工作台。

| 文件 | 作用 |
|---|---|
| [`src/client/apply.tsx`](src/client/apply.tsx) | 注册 locale 并占用 launcher 槽位 |
| [`src/client/YuanShuAccountLauncher.tsx`](src/client/YuanShuAccountLauncher.tsx) | 头像触发器、资料加载与账号菜单 |
| [`src/client/profile.ts`](src/client/profile.ts) | token 读取、资料缓存与网关请求 |

</details>

<a id="further-exploration"></a>
## 进一步探索

- [元枢登录服务](../../yuanshu/yuanshu-login-server/README.zh.md) — 登录页与身份标记。
- [元枢网关](../../yuanshu/yuanshu-gateway/README.zh.md) — 同源 `/user/me` 路由。

<a id="model-experience"></a>
## 模型体验

无，因为该入口不会注册模型工具、提示或会话事件。

#### KV Cache 影响

该入口不会构造模型请求，也不会改变提供方缓存的复用行为。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **需要 Host 集成** — 入口依赖同源网关与登录页保存的 token；缺失时显示兜底文案。
- **身份唯一** — 入口假设元枢拥有侧栏身份位置；DeepSeek 账号登录仅保留在设置页。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
