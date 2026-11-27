# AGENTS.md — Experimental packages

These rules supplement the [package rules](../AGENTS.md). The [experimental reference](README.md#status) defines experimental, optional, and Official status; the rules below define dependency isolation and promotion.

- A package belongs here only when its complete public contract is experimental or internal-only. An experimental option inside a release package stays with its owning product role.
- Name a new package `@deepseek-ai/dsh-<name>`, never `@deepseek-ai/dsh-experimental-<name>`, and add its directory to `EXPERIMENTAL_PACKAGE_NAME_EXCEPTIONS` in [the experimental naming policy](../../scripts/experimental-package-policy.ts); isolation checks and plugin-record ownership recognize an unprefixed experimental name only through that map. A name with the `experimental` prefix must change when the package moves to a product group, which breaks every import, dependency entry, and configuration that names it. `pnpm run constraints` rejects the prefix outside `LEGACY_PREFIXED_EXPERIMENTAL_PACKAGE_DIRECTORIES`, which must not grow.
- Packages join the dsh release family by default: omit `private` and set `publishConfig.access: public`. Only directories in `PRIVATE_EXPERIMENTAL_PACKAGE_DIRECTORIES` in [the publication policy](../../scripts/experimental-package-policy.ts) stay private: set `private: true` and omit `publishConfig`.
- Release packages and apps outside this group must not name experimental packages in `dependencies`, `optionalDependencies`, or `peerDependencies`. [Default-product isolation](../../.agents/notes/implemented/process/2026-09-12-default-product-experimental-isolation.md) also checks transitive installations, runtime imports, and shipped compositions in CI. Experimental packages may depend on release packages and each other. Tests may use experimental packages through `devDependencies`; examples may load them explicitly.
- Experimental status does not relax engineering, security, documentation, lifecycle, testing, or snapshot requirements.
- Publishing an experimental package does not promote it or add a stability promise. Promotion moves a package to its product-role group. An unprefixed package keeps its npm name and leaves `EXPERIMENTAL_PACKAGE_NAME_EXCEPTIONS`. A package with the legacy prefix is renamed under that group's naming rules. Update affected imports and configuration rows atomically, then review its public contract, limitations, test evidence, release payload, runtime dependents, and named stable owner.

## 元枢员工工作台业务插件

本节适用于元枢企业工作台。独立的内部业务插件放在本目录的 `<plugin-name>/`，现有工作台插件位于 `yuanshu-workbench/`。同一插件内的业务模块继续由该插件维护。随工作台分发的员工技能统一放入[技能包根目录](yuanshu-workbench/skills/AGENTS.md)。

- 元枢自定义插件的名称、注册 ID 和目录名统一以 `yuanshu-` 开头。npm 包名保留仓库统一的 `@deepseek-ai/dsh-` 前缀，例为 `@deepseek-ai/dsh-yuanshu-workbench`。包内独立业务插件目录也遵循该规则。更名时同步更新依赖、打包配置和插件总览，并兼容已持久化的旧标识。

项目内新增或已有的元枢业务插件包，必须在本目录的[插件包总览](插件包总览.md)登记。每条记录至少包含包名、目录、功能描述、适用范围和维护入口；新增插件包时必须在同一变更中更新总览，不得只新增目录或 `package.json` 而遗漏登记。

- 在插件 README 写明目标岗位、员工任务、可访问的数据范围、调用的 MCP 工具或 HTTP 方法和路径、发生写入的动作，以及正常和受限场景的验收示例。
- 表单字段、JSON 子字段、可选值和默认值必须来自当前生效的数据库结构、字段中文备注、约束或服务端 API 契约。界面只翻译正式定义的枚举含义并保留原值，不得自行增加字段、状态或默认值；过期迁移和已删除字段不能当作当前依据。
- 字段备注以「值=含义」定义固定选项时，插件应声明下拉框的中文标签与原值。提交前校验原值和类型，不能唯一匹配的输入交给用户确认。
- 客户端通过宿主业务路由获取数据。宿主使用当前员工身份访问 MCP 或业务 API。开发前核对现有 MCP 清单和 Swagger，按服务端实际授权处理兼岗、调岗及数据范围。插件和随包脚本禁止直连业务数据库或分发数据库凭据。
- 保存、提交等人工确认表单必须在操作完成且收到可验证的成功回执后才关闭。请求处理中应显示等待状态并禁用重复操作；失败时保留弹窗和用户输入，展示可理解的错误并允许用户检查或按安全规则重试，不得把发起请求当作成功。
- 通用确认和内容编辑统一采用[工作台 A2UI 固定模板](yuanshu-workbench/src/business-forms/templates/README.md)。插件负责注册业务字段、动作及回调，技能仅提供允许的业务数据。
- 通用新增技能按业务对象查找表单。插件可用授权的数据目录中核实的表名和中文备注识别对象，以正式新增接口契约决定是否可登记。多候选由员工确认，只有表结构时只提供识别结果。
- 设备登记、人员入职登记、新建合同及项目结算单统一采用「下载模板或描述预填 → 校验与查重 → A2UI 人工复核 → 云端保存 → 回执确认」流程。字段、主数据选项、查重口径与写入权限由各业务插件按正式契约提供。缺少契约时不得启用对应写入。
- 高权限操作应有独立权限和人工确认。登记人员不自动开设系统账号或分配角色；新建合同和结算单不自动签署、审批或付款。连接中断或回执无法确认时，先查原请求结果或核对台账。

员工技能包只描述业务流程。禁止在任何随包文件中编写后台连接逻辑或披露 API 地址、接口字段及调用细节。后台访问由插件宿主通过授权的 MCP 或 API 服务完成。
