# 元枢 DeepSeek Harness 集成后台

独立 Go HTTP 服务，默认只提供进程存活探针。配置连接和可信身份后提供少仕客户资源接口，不需要 Docker，也不会在启动时执行迁移。开发与交接前阅读 [AGENTS.md](AGENTS.md)。

## 本地运行

安装 Go 1.26 或更新版本，在本目录执行：

```sh
go run ./cmd/starpivot-backend
```

也可以使用启动脚本：

```sh
./start-backend.sh
```

启动脚本会先编译服务，发现已有本项目后台进程时先停止，再启动新版本。它不会启动 Docker 或本地 PostgreSQL，默认读取 `config/local.json` 并连接云端业务数据库。使用其他配置文件时设置 `DSH_BACKEND_CONFIG=/绝对路径/配置文件.json`。

在另一终端调用：

```sh
curl --fail http://127.0.0.1:3081/api/v1/apps/deepseek-harness/health
```

默认读取 `config/local.json`，其中包含监听地址、云端业务数据库连接串和网关密钥。该文件仅保存在本机并已加入忽略规则。`SIGTERM` 或 `Ctrl+C` 触发优雅停止。

本地 PostgreSQL 数据目录在 `.local/postgres`，仅监听 `127.0.0.1:55432`，作为云端数据库备份与隔离测试数据源。连接信息保存在忽略的 `config/local-backup.json`，不作为后台服务默认数据源。需要对备份做集成测试时，显式设置测试连接串，并确认使用空的测试数据库。

## 启用客户资源

本机临时联调可在 `config/local.json` 设置 `temporary_read_tenant_id`。服务优先使用已校验的网关身份。缺少可信身份时，回环地址发来的 GET、HEAD 查询使用配置指定的租户。省略或设为 `0` 使用常规网关鉴权。写入需要网关提供的真实用户 ID 和写权限。

1. 客户响应根据现有 `deleted_at` 计算 `is_deleted`。若数据库也需要独立的 `is_deleted` 生成列，可以在维护时段执行 [版本化迁移](migrations/0001_customer_deletion_flag.sql)。存储型生成列可能重写表并持排他锁。
2. 在 `config/local.json` 填写云端 PostgreSQL DSN 和 32 字节网关密钥。该后台默认连接云端业务库，本机备份配置单独保存在 `config/local-backup.json`。`DSH_BACKEND_CONFIG` 可以指定其他配置文件，`DSH_BACKEND_ADDR`、`DSH_BACKEND_DATABASE_URL` 和 `DSH_BACKEND_GATEWAY_KEY` 可以覆盖配置文件字段。未配置数据库时只启动存活探针，仅配置其中一项会启动失败。
3. 直接执行 `go run ./cmd/starpivot-backend`。独立模式要求本机回环监听：本机网关先校验元枢 Bearer、租户和客户读写权限，剥除所有外部同名头，再为内部请求设置 `X-Starpivot-Gateway-Key`、`X-Starpivot-User-Id`、`X-Starpivot-Tenant-Id` 和 `X-Starpivot-Customer-Access`（`read` 或 `write`，后者可读写）。共享密钥不要发给前端。源码合并时用元枢鉴权实现替换 `CustomerAuthorizer`，接管原有客户路由，不要重复注册或并行使用旧写入实现。

已放入 `database/` 的 JSON 是业务表快照，不是 `pg_dump` 格式。该快照缺少 DDL，恢复时从对应服务器只读获取 schema。快照文本含有非标准反斜杠转义，恢复器要先修复到临时文件并完整解析，再逐表导入。每次取新云端快照后需重新恢复，不要把快照文件提交到版本库。业务运行与正式表结构变更以云端数据库为准；数据库变更通过版本化迁移实施，并由有权限的维护流程执行，不在服务启动时自动执行。隔离测试只使用本地测试数据库。

客户和供应商列表在当前租户未删除的档案中支持 `code`、`name`、`contact_person` 组合筛选，供应商还支持 `category` 精确筛选。旧版 `keyword` 搜索可继续使用。通过 `sort_by` 和 `sort_direction` 指定排序后，服务端再应用 `page` 和 `page_size`。`data.total` 是匹配记录数，`data.archive_total` 是应用筛选之前的档案总数。供应商分类选项来自 `GET /api/v1/apps/shaoshi/supplier-categories`。

客户集合 `POST` 新建，单项 `GET/PUT/DELETE /api/v1/apps/shaoshi/customers/{id}` 分别读取、更新和软删除。软删后编码仍受数据库原有全局唯一约束。创建人保存为元枢用户 ID，历史值 `0` 保持原值，更新保留创建人和创建时间。

供应商管理已按 Swagger 路径提供供应商主档、供应商分类、联系人、银行账号和资质的列表、新建、更新、软删除接口。列表响应统一包含 `data.items`、`data.total`、`data.page` 和 `data.page_size`。供应商资源只接受现有表的业务字段，系统租户、创建人、创建时间、更新时间和删除时间由服务端维护。Swagger 中的 `supplier-closure/{entity}` 已注册并会进行身份校验，但暂返回 `501`，因为当前契约没有给出 `entity` 的允许值，快照中也没有可确认的通用关闭记录表，避免将请求误写入其他业务表。

## 物料与分类

`GET /api/v1/apps/shaoshi/materials` 支持编码、名称、物料类型、关键等级和分类筛选。分类包含子级，以物料原有的一级或二级分类编码关联。返回分页匹配数、当前租户档案总数及可用的类型和关键等级值。`sort_by` 仅接受 OpenAPI 列出的字段，`sort_dir` 为 `asc` 或 `desc`。

`GET /api/v1/apps/shaoshi/material-categories` 根据 `keyword` 搜索分类编码或名称，返回命中分类及其祖先。`POST` 在同一地址新增根分类或指定父级下的子分类。新增需要可信网关身份与写权限，服务端校验父级租户与状态并生成层级和路径。

物料档案行操作通过 `PUT /api/v1/apps/shaoshi/materials/{id}` 更新业务字段，并通过 `DELETE` 对同一资源软删除。两种写入都要求可信网关身份及写权限，租户来自身份上下文；本地工作台通过 `identity_api` 配置时，服务端也可解析元枢 Bearer 身份。更新保留创建审计和导入溯源字段，删除只设置已有 `deleted_at`，以保留其他业务表中的物料引用。

## 设备台账

设备台账使用 `public.eqp_equipments`。元枢 Swagger 中暂无该业务的同用途接口，路径使用独立应用命名空间。

| 操作 | 方法 | 路径 |
| --- | --- | --- |
| 设备列表 | GET | `/api/v1/apps/deepseek-harness/equipments` |
| 新建设备 | POST | `/api/v1/apps/deepseek-harness/equipments` |
| 设备详情 | GET | `/api/v1/apps/deepseek-harness/equipments/{id}` |
| 更新设备 | PUT | `/api/v1/apps/deepseek-harness/equipments/{id}` |
| 删除设备 | DELETE | `/api/v1/apps/deepseek-harness/equipments/{id}` |

列表支持 `keyword`、`page`、`page_size`、`sort_by` 和 `sort_direction`。响应中 `data.total` 是匹配总数，`data.archive_total` 是当前租户未删除档案总数。本机查询允许使用后台配置的临时租户，写入要求可信网关写权限。更新按 PUT 语义替换全部可编辑字段。删除为软删除，原编码继续受全局唯一约束。

通过 [0005_equipment_ledger.sql](migrations/0005_equipment_ledger.sql) 开启人工录入与软删除。测试可设置 `DSH_EQUIPMENT_TEST_ADMIN_URL` 指向本机 PostgreSQL 的 `postgres` 管理库，再运行 `go test ./internal/transport/httpapi -run TestEquipment -count=1`。测试自行创建并清理独立数据库。

## 合同管理

合同列表复用 `public.fin_contracts`，按同租户 `public.prj_projects` 左连接补齐项目编号与名称。本次只提供只读列表，不写入合同数据，因此不需要迁移。元枢 Swagger 只有项目级合同接口，跨项目合同列表使用独立应用命名空间。

| 操作 | 方法 | 路径 |
| --- | --- | --- |
| 合同列表 | GET | `/api/v1/apps/deepseek-harness/contracts` |

列表支持 `keyword`（合同编号、相对方、来源合同号、项目编号/名称）、`page`、`page_size`、`sort_by` 和 `sort_direction`。响应中 `data.total` 是匹配总数，`data.archive_total` 是当前租户全部合同数。本机查询允许使用后台配置的临时租户。测试可设置 `DSH_CONTRACT_TEST_ADMIN_URL` 指向本机 PostgreSQL 的 `postgres` 管理库，再运行 `go test ./internal/transport/httpapi -run TestContract -count=1`；未配置时数据库用例跳过。

## 组织架构

部门与成员数据由元枢服务维护，本地库没有对应表，因此本服务按元枢 Swagger 的原始路径透传调用方凭证（`Authorization: Bearer`，可选 `X-Active-Tenant`），不落库、不缓存。上游地址复用 `identity_api` 配置。

| 操作 | 方法 | 路径 |
| --- | --- | --- |
| 组织架构树 | GET | `/api/v1/departments/tree` |
| 成员列表 | GET | `/api/v1/users` |

成员列表支持 `department_id`、`keyword`、`page`、`page_size`。元枢用户接口本身不支持按部门过滤，本服务先读取部门树，按所选部门及其全部子部门在本地过滤后再分页。`keyword` 原样传给元枢。组织架构树的每个节点附带 `total_members`，是本部门及其全部子部门的成员总数，由本服务读取全量用户后自底向上累加。凭证缺失返回 401，上游不可用返回 502。测试：`go test ./internal/transport/httpapi -run TestOrganization -count=1`。

## 项目周报和工时填报

- `GET /api/v1/apps/shaoshi/projects` 提供项目选择，支持关键词和分页。
- `/api/v1/apps/shaoshi/projects/{code}/labor-hours` 复用 `public.fin_labor_hours`，支持日期范围查询、创建本人的草稿和更新可编辑记录。通过 `POST /{id}/submit` 提交本人的工时草稿。小时数使用十进制字符串表示。
- `/api/v1/apps/deepseek-harness/projects/{code}/weekly-reports` 查询和保存北京自然周的周报，通过 `POST /submit` 提交并锁定正文。汇总实时读取同租户、同项目、同周的已批准工时。
- 周报需要 [0002_project_weekly_reports.sql](migrations/0002_project_weekly_reports.sql)。正式目标为云端 `cp_shaoshi`，由维护流程执行，服务启动时不自动执行。
- `GET`、`PUT /api/v1/apps/deepseek-harness/weekly-reports` 读写当前登录人本人的周登记。身份来自网关头，或配置 `identity_api` 后由服务端携带浏览器下发的 `Authorization: Bearer` 与 `X-Active-Tenant` 向元枢 `/api/v1/user/me`、`/api/v1/user/tenants` 解析当前用户与当前租户；租户编码与凭证当前租户不一致时拒绝。该路由不接受临时租户身份，Bearer 身份只授予本人数据的读写权限；`DSH_BACKEND_IDENTITY_API` 可覆盖该配置，留空时保持仅网关鉴权。

## 工程与交接

- `cmd/starpivot-backend`：命令入口、配置与组装。
- `internal/server`：HTTP 超时和进程关闭。
- `internal/transport/httpapi`：路由、请求响应与协议适配。
- `internal/customer`：客户领域、用例和 PostgreSQL 仓储。
- `internal/material`：物料查询、编辑、软删除及分类树和分类创建。
- [`api/openapi.json`](api/openapi.json)：合并时用于对照的 OpenAPI 3.1 契约；健康接口 `operationId` 为 `getApiV1AppsDeepseekHarnessHealth`。

新增业务时按领域拆分应用用例、领域模型和仓储适配；第一批接口需先确认复用的元枢 API 或表、租户权限以及数据归属。接手前确定正式 Go 模块路径、在元枢的路由挂载和鉴权方式；需要迁移时由接手方确认迁移工具及执行权。

## 质量检查

```sh
gofmt -l .                        # 应无输出
go vet ./...
go test ./...
go build ./...
```

数据库集成测试可在空的本机 PostgreSQL 数据库 `dsh_customer_test` 中运行，设置 `DSH_TEST_DATABASE_URL` 后执行 `go test ./internal/customer/repository -count=1`。测试会初始化该库并执行迁移，禁止使用业务数据库。

### 个人工作日报

独立接口契约见 `api/daily-reports.openapi.json`，主 `api/openapi.json` 通过 Path Item 引用挂载。新增 `GET /api/v1/apps/deepseek-harness/daily-reports/schema`、`GET /api/v1/apps/deepseek-harness/daily-reports/{date}`、`PUT /api/v1/apps/deepseek-harness/daily-reports/{date}`。只允许当前可信用户在当前租户下读取和登记本人日报，禁止临时租户读降级；不接受用户、租户和审计时间字段。PUT 根据 `status` 保存草稿或原子提交，使用 `expected_version` 和最近 `request_id` 防止覆盖及重复写入。

先由维护流程在目标云端库执行 `migrations/0009_daily_work_reports.sql`，再重启服务。启动不会自动迁移。集成测试显式设置 `DSH_DAILY_TEST_DATABASE_URL` 为回环 PostgreSQL 的 `postgres` 管理库，测试自动新建并清理一次性 `dsh_daily_test_*` 数据库，不写入业务库或备份库。运行：`go test -v ./internal/dailyreport/... ./internal/transport/httpapi -run 'TestDaily|TestInputValidation'`。
