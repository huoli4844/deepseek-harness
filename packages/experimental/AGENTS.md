# AGENTS.md — Experimental packages

These rules supplement the [package rules](../AGENTS.md). The [experimental reference](README.md#status) defines experimental, optional, and Official status; the rules below define dependency isolation and promotion.

- A package belongs here only when its complete public contract is experimental or internal-only. An experimental option inside a release package stays with its owning product role.
- Name a new package `@deepseek-ai/dsh-<name>`, never `@deepseek-ai/dsh-experimental-<name>`, and add its directory to `EXPERIMENTAL_PACKAGE_NAME_EXCEPTIONS` in [the experimental naming policy](../../scripts/experimental-package-policy.ts); isolation checks and plugin-record ownership recognize an unprefixed experimental name only through that map. A name with the `experimental` prefix must change when the package moves to a product group, which breaks every import, dependency entry, and configuration that names it. `pnpm run constraints` rejects the prefix outside `LEGACY_PREFIXED_EXPERIMENTAL_PACKAGE_DIRECTORIES`, which must not grow.
- Packages join the dsh release family by default: omit `private` and set `publishConfig.access: public`. Only directories in `PRIVATE_EXPERIMENTAL_PACKAGE_DIRECTORIES` in [the publication policy](../../scripts/experimental-package-policy.ts) stay private: set `private: true` and omit `publishConfig`.
- Release packages and apps outside this group must not name experimental packages in `dependencies`, `optionalDependencies`, or `peerDependencies`. [Default-product isolation](../../.agents/notes/implemented/process/2026-09-12-default-product-experimental-isolation.md) also checks transitive installations, runtime imports, and shipped compositions in CI. Experimental packages may depend on release packages and each other. Tests may use experimental packages through `devDependencies`; examples may load them explicitly.
- Experimental status does not relax engineering, security, documentation, lifecycle, testing, or snapshot requirements.
- Publishing an experimental package does not promote it or add a stability promise. Promotion moves a package to its product-role group. An unprefixed package keeps its npm name and leaves `EXPERIMENTAL_PACKAGE_NAME_EXCEPTIONS`. A package with the legacy prefix is renamed under that group's naming rules. Update affected imports and configuration rows atomically, then review its public contract, limitations, test evidence, release payload, runtime dependents, and named stable owner.

## 元枢员工工作台业务插件

本节适用于元枢企业工作台。独立的内部业务插件放在本目录的 `<plugin-name>/`，现有工作台插件位于 `client-yuanshu-workbench/`。同一插件内的业务模块继续由该插件维护。随工作台分发的员工技能统一放入[技能包根目录](client-yuanshu-workbench/skills/AGENTS.md)。

- 在插件 README 写明目标岗位、员工任务、可访问的数据范围、调用的 MCP 工具或 HTTP 方法和路径、发生写入的动作，以及正常和受限场景的验收示例。
- 客户端通过宿主业务路由获取数据。宿主使用当前员工身份访问 MCP 或业务 API。开发前核对现有 MCP 清单和 Swagger，按服务端实际授权处理兼岗、调岗及数据范围。插件和随包脚本禁止直连业务数据库或分发数据库凭据。
- 通用确认和内容编辑统一采用[工作台 A2UI 固定模板](client-yuanshu-workbench/src/business-forms/templates/README.md)。插件负责注册业务字段、动作及回调，技能仅提供允许的业务数据。

员工技能包只描述业务流程。禁止在任何随包文件中编写后台连接逻辑或披露 API 地址、接口字段及调用细节。后台访问由插件宿主通过授权的 MCP 或 API 服务完成。
