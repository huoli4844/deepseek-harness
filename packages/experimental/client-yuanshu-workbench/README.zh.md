---
description: "安装少仕科技专用的可选工作台，提供岗位助理收件页、岗位图表和公共工作功能。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-client-yuanshu-workbench

[English](README.md) | 中文

## 概述

此可选组合包在 DSH 中直接打开岗位助理收件页，汇集岗位关注、本人任务和日程并提供直达操作；岗位工作台保留各岗位图表供进一步查看。18 个已核实岗位和额外的公司管理层视角都展示 4 个 KPI 关联场景与 3 项岗位日常工作，每项都连接到本岗位工作方法。公司管理层可从风险汇总进入责任岗位。记录与 KPI 映射均为保存在当前浏览器 profile 中的演示数据；组合包未连接元枢 MCP、不调用模型，也不通过 Host 持久化数据。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

### 从当前检出目录预览

在仓库根目录构建当前检出版本，并将本地组合包安装到独立 Web profile。DSH 默认组合不包含此专用工作台。

```sh
pnpm run build
DSH_HOME=/tmp/dsh-yuanshu-plugin-preview pnpm dsh plugin --profile web add "link:$PWD/packages/experimental/client-yuanshu-workbench"
DSH_HOME=/tmp/dsh-yuanshu-plugin-preview pnpm dsh --profile web --patch apps/web/tests/pin-browse-picker.overlay.yml --port 4317 --no-open
```

打开 DSH 输出的本地入口地址。插件加载后进入**元枢工作台**的**我的助理**页，仅显示工作台自己的导航和内容。收件页汇集岗位关注、本人任务和日程；**岗位工作台**用于查看图表和比较。独立 profile 拥有单独的模型配置与历史记录。通过工作台底部按钮返回 DSH 原始界面，当前会话保持选中。演示记录保存在当前浏览器 profile 中，页面刷新或插件重新加载后仍会保留；清除站点数据会删除这些记录。

### 可体验的功能

- 普通岗位提供 6 张图表，公司管理层与特种车业务总裁提供 8 张：趋势、进度、业务分布、计划对比、每周完成量和风险矩阵；管理层另含回款和资源覆盖率。新增图表可打开数据明细并进入关联任务。
- 切换全部 19 个岗位视角：助理收件页和岗位图表会随岗位适配，公共导航始终可用。公司管理层与特种车业务总裁可从风险汇总进入责任岗位。
- 查看按优先级排列的十项公司重点工作，包括合成演示值、来源、责任岗位和下一步行动；可按当前岗位筛选，并进入对应 KPI 工作流。
- 打开岗位的任一 KPI 关联场景，助理会进入其典型工作，套用对应岗位方法并准备待复核草稿；每个岗位另列 3 项日常工作入口。
- 全部 57 项岗位工作配置建议方法，以及各自的材料、交付物和验收关注点。材料、分析、成果和审阅阶段内嵌方法指导、证据记录与自查项；版本保存方法执行快照。方法库直接打开对应任务。
- 打开任务、编辑建议、保存版本、比较快照、采纳预设建议并模拟审阅交接。
- 选择日历日期并添加本地日程；切换岗位后，日程和消息已读状态仍保留。
- 通过资料和团队页面查看公共材料及岗位协作分工。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

清单同时声明 `dsh.bundle.patch` 和 `dsh.client`。补丁插入 Host 载体；浏览器入口通过 Cordis effect 注册带键的 `main` 面板与 `sidebar.panellist` 入口，随后选中工作台。全屏、无默认标题栏的 DSH Modal 呈现工作台并管理键盘焦点；按 Escape 时，内部对话框优先于工作台关闭。界面使用 DSH 语言词典、主题令牌、公共控件和声明式 store。卸载插件会移除其注册内容。插件不替换 DSH 根界面、不向文档注入 HTML，也不提供独立应用。

| 文件 | 职责 |
|---|---|
| [清单](package.json) | 组合包与浏览器导出 |
| [补丁](dsh/cordis.patch.yml) | 显式启用条目 |
| [浏览器入口](src/client/index.ts) | 生命周期托管的注册 |
| [工作台](src/client/Workbench.tsx) | 岗位与公共页面 |
| [状态](src/client/model.ts) | 浏览器本地工作台状态与已保存快照 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [实验性包](../README.zh.md#status)
- [客户端插槽](../../client/ui-slots/README.zh.md)
- [设计草案](../../../docs/scratch/shaoshi-workbench/design.zh.md)

<a id="model-experience"></a>
## 模型体验

无，因为工作台仅展示本地演示记录及预设建议，不提供工具、提示词或会话事件。

#### KV 缓存影响

工作台导航与草稿编辑不改变模型请求及其缓存。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 岗位选择仅演示界面适配，不授予身份或业务权限。公司管理层是额外演示视角，没有在平台岗位表中新增岗位；项目管理尚未配置 KPI，其图表仅展示演示进度。
- 图表数值、资料和日程日期均为合成演示内容，不是已确认的 KPI 公式或实时经营结果。
- 交接和消息仅在本地模拟，不发送消息，不创建平台任务或审批。
- 16 种建议方法需经业务确认后才能成为正式规程。自查只记录用户确认；未完成的事项可携带可见缺口提交协同审阅，不会自动通过审批。
- 演示记录仅保存在当前浏览器 profile，不会跨设备同步，也不是元枢业务记录。元枢 MCP 集成与业务状态持久化不属于此原型范围。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

此包是 `dev` 分支上的可选插件原型，用于在平台集成前评审界面。

</details>
