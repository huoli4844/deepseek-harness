---
description: "在浏览器中提供元枢工作台面板与会话页签，覆盖本体、能力、场景、DAG、知识库与问答，并通过 Harness 同源网关发送请求。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-yuanshu-chat

[English](README.md) | 中文

## 概述

挂载此浏览器插件后，可以消费元枢平台经鉴权的 MCP 能力目录和应用工作台。它向同源 `/yuanshu-api` 网关发送请求，并从 `localStorage.yuanshu-token` 读取登录 token；网关管理按用户与租户隔离的独立 MCP 授权。Host profile 必须挂载元枢网关。

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

将该包加入包含会话 slots 和 locale 服务的 Client 组合。

### 何时选择

需要浏览器知识问答视图时选择此插件。面向模型的 [`yuanshu_qa` 工具](../../yuanshu/yuanshu-qa-tool/README.zh.md)独立提供，可不依赖此视图。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-client-ui-yuanshu-chat'
```

该视图没有插件配置。Host 需要提供登录页和同源网关路由。

主入口通过发现的 MCP 只读工具自动读取当前用户的岗位、简报、待决策事项、首页和业务导航。岗位名称、指标文案、关注事项和可见业务域由平台提供，客户端没有按岗位名称判断的分支。业务事项可打开分页记录及平台提供字段名称的详情。尚未开放的业务场景明确显示不可用。业务读取失败显示错误，不冒充空队列。首次访问需要用户同意，页面重载复用已保存的授权。

开发调试入口打开独立的能力测试视图。工具结果只刷新原 Run，不重新加载身份或能力目录。刷新、选择租户、授权和撤销授权会重新加载目录。页面重载仅恢复当前登录主体所属的原 Run 句柄，再查询平台；不会重新提交业务操作。

大表格最多预览 100 行、12 列。大型对象和深层嵌套值也会显示预览提示，并提供明确的控件展开本次返回的完整 JSON。预览不会修改平台结果，也不将服务端分页响应说成全量数据。

保留的岗位组件 `WorkbenchPanel` 按所选空间读取集合和发布版本。刷新时即使空间不变，也会重新读取两份目录，并忽略较早请求的晚返回结果。DSH 会先用 `ontology_context` 读取选定发布版本的对象、字段、关系和查询能力，再调用本体查询工具；实际行数据仍由元枢现有消费方绑定与数据策略授权。`ontology_evidence` 提供运行和治理审计样本，知识文档引用使用 `knowledge_search`。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

视图保存返回的 `task_ref`，所有任务统一通过 `task_get` 和 `task_cancel` 查询及取消。旧显示定位符转换为该引用，不重放业务操作。平台跟随已有审批恢复记录，并在每次读取和取消时校验权限。能力选项优先显示平台提供的业务名称。

插件通过 slot registry 注册 locale 字典并注入会话视图。视图向 Host 网关发送 SSE 请求，并显示完成后的答案和引用。

| 文件 | 作用 |
|---|---|
| [`src/client/apply.tsx`](src/client/apply.tsx) | 注册 locale、网关客户端和会话视图 |
| [`src/client/ChatPanel.tsx`](src/client/ChatPanel.tsx) | 输入问题、处理流式请求并显示结果 |

</details>

<a id="further-exploration"></a>
## 进一步探索

- [元枢网关](../../yuanshu/yuanshu-gateway/README.zh.md) — 同源上游路由。
- [元枢问答工具](../../yuanshu/yuanshu-qa-tool/README.zh.md) — 面向模型的知识问答。

<a id="model-experience"></a>
## 模型体验

无，因为浏览器视图不会注册模型工具、提示或会话事件。

#### KV Cache 影响

该视图不会构造模型请求，也不会改变提供方缓存的复用行为。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **需要 Host 集成** — 只有挂载同源网关且登录页已保存浏览器 token 后，视图才能访问元枢。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
