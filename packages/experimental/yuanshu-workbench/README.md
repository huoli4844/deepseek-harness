---
description: "Use the Shaoshi workbench to review a role-aware assistant inbox, position dashboards and shared work views."
kind: "package-bundle"
---

# @deepseek-ai/dsh-yuanshu-workbench

English | [中文](README.zh.md)

## Summary

Inside DSH Web, this bundle provides a role-aware assistant inbox, position dashboards, project operations, workgroups and schedule actions. It includes KPI-led scenarios and daily methods for 18 positions and company management. Dashboards and collaboration records remain browser-local demonstrations. The native assistant can discover permitted YuanShu tools through employee MCP. **My tasks** and **Calendar** use YuanShu's authenticated REST API through the DSH Host proxy, following the `.env` local or remote API selection.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Connect an employee account

Set `mcp.url` and `mcp.clientId` on the `yuanshu-workbench` plugin row for a single-account DSH Host. Register the exact DSH origin plus `/mcp/oauth/callback/56a411dab576919cbca52fcfee03f1a34ff9b37d4858c71c781c9005942ac59f` in YuanShu. Add the client ID under the tenant ID in YuanShu's `client_mcp.preauthorized_clients`. Open Plugins → YuanShu workbench → Sign in to YuanShu. After browser login the registered client receives read access without a separate consent click. Other clients continue through explicit consent. The current authorization page requires a login that completes without an MFA or CAPTCHA challenge.

For the source checkout, copy the root `.env.example` to `.env`. The Web login server, workbench MCP client, and business-data proxy use the YuanShu cloud deployment configured by `YUANSHU_REMOTE_API_URL` and `YUANSHU_REMOTE_MCP_URL`. `YUANSHU_MCP_STARTUP_TIMEOUT_MS` limits each MCP connection attempt and initial tool discovery independently of API and tool-call requests; it defaults to `30000` ms, while `requestTimeoutMs` defaults to `90000` ms.

In connected mode, Today’s work, Position dashboard, Project operations, Business priorities, and Work methods continue to use the employee MCP projection. My tasks and Calendar read and write the personal task, calendar, and event REST resources through the Host proxy. Notifications are merged into the To-dos page. Workgroups and files show a missing source message until a platform data source is connected.

After sign-in, the Host concurrently loads the employee's active-tenant roles and effective permissions from `GET /api/v1/user/me`, indexes the cloud Swagger operations, and refreshes the MCP tool catalog when the authorized connection is ready. The assistant can search the Swagger catalog and check permissions from a bound employee session. Swagger discovery reports documented operations. Saving requires a workbench action and backend authorization. When a business request fails, the Host reuses an MCP catalog fetched within five minutes or coalesces concurrent refreshes after expiry.

My Profile reads the signed-in employee's assignments through the Host using `GET /api/v1/user-positions?user_id=…`. It displays the current position's description, using `GET /api/v1/positions/all` when the assignment does not include it. The permissions section filters the loaded catalog by name or code and preserves the path to matching permissions.

Employees with equipment write access can open equipment intake from the ledger or the [equipment registration skill](skills/yuanshu-business-record-create/SKILL.md). The form accepts a UTF-8 CSV or TSV sheet and checks equipment codes and serial numbers using the current tenant's equipment list. A person reviews the fields and clicks Save before the Host sends any create request. Failed rows remain editable after an explicit rejection, and rows with verified receipts are skipped on retry. Implementation and permission boundaries are documented in [Work records](docs/work-records.md).

Employees with customer write access can use the same skill to register customers. When they confirm that the chat details should be used, the workbench opens an editable prefilled form. It checks customer codes against the current tenant's list and saves through the cloud customer API (`POST /api/v1/apps/shaoshi/customers`) under the employee's permissions. An explicit rejection keeps the form open with its inputs.

The same skill can prepare a project sales contract draft from the current conversation. The form checks the project and resolves the customer within the current tenant before saving through `POST /api/v1/apps/shaoshi/projects/{code}/contracts`. The cloud service checks write access on save. The API does not accept a custom contract number. Clear a proposed number only if the service's number is acceptable. A verified receipt includes the assigned number.

The same business form skill opens project creation for employees with project write access. The form requires a project code and name. Saving checks the code and calls `POST /api/v1/apps/shaoshi/projects` with the employee's current tenant credentials. If the response only supplies an ID or success code, the form reads the project back by code before reporting success.

### Preview from this checkout

After building the checkout, run the Web profile from the root of the `dev` branch. The source launcher adds the workbench bundle before applying your Web profile patches.

```sh
pnpm run build
pnpm dsh web
```

Open the local entry URL printed by DSH. Loading the plugin opens **YuanShu workbench** on **Today’s work**, with only its own navigation and content visible. The page surfaces the next action and its reason for the selected role; **Position dashboard** opens charts and comparisons. Return to the original DSH interface with the workbench footer button; the current Session remains selected. Demo records persist in this browser profile across page refreshes and plugin reloads; clearing site data removes them.

The right-hand conversation places the workspace switcher above the input box, aligned to its right edge. Its menu opens upward and supports switching workspaces, opening their conversations, and creating a workspace.

Contract management opens project cards by default, supports server-side search and switching to the contract list, and shows project financial summaries with contract details. Gross profit uses the cloud project finance summary; its overall margin is weighted by project revenue. Missing financial values remain unavailable. Statistic cards center both their labels and values.

### Employee daily report workflow

Target users are employees preparing their own daily report, including technical and management positions that require reporting. The assistant reads only the current employee's verified active workbench conversations for the Beijing business day. It cannot use this workflow to query another employee's reports or company financial summaries. The employee skill contains business procedure only; runtime tool bindings, field contracts and backend access belong to the Host plugin.

The report editor explicitly binds the versioned local `edit.v1` template. It preserves an existing employee-edited draft, focuses the first editable field, keeps the title and footer fixed, and scrolls the body. The model supplies allowlisted content; only the employee's Save draft or Confirm submission action can write through this workflow.

| Method and backend path | Employee scope and action |
| --- | --- |
| `GET /api/v1/apps/deepseek-harness/daily-reports/schema` | Validated current employee and tenant; authorized report fields |
| `GET /api/v1/apps/deepseek-harness/daily-reports/{date}` | Read the current employee's report for a business date |
| `PUT /api/v1/apps/deepseek-harness/daily-reports/{date}` | Human-confirmed final content; versioned draft save or atomic submission |

Browser requests use the same-origin `/yuanshu-workbench/daily-report-runtime` Host routes. The Host uses the employee's current credentials against the configured local business service. No plugin or skill script connects to the business database.

Acceptance examples: preparing a report opens an editable draft without writing; confirming after editing persists the final employee text. A different employee or tenant cannot claim the conversation or read its draft. A submitted report refuses edits. A lost save response retains the same request for retry and never displays unconfirmed success. Migration `0009_daily_work_reports.sql` must be run by the backend maintenance process before live use; it is not applied at startup.

### What you can try

In Time entry, select a project to view and update work hours. In Weekly report registration, select a project and a Beijing calendar week, save a draft, and submit it to lock the report. The approved-hours summary links to the selected project's time entries for that week. Saving and submitting require a trusted YuanShu gateway identity. The weekly report service also requires the database migration.

The Customer resources and Supplier management tables keep row actions fixed on the right during horizontal scrolling. Their audit timestamps are displayed in Beijing time (`Asia/Shanghai`).

Submit customer or supplier search filters to query the business backend. Choose a supplier category from the current tenant's categories. Click a data column header to sort the full result set before pagination. The archive total sits before the pagination controls, which show the matching page count. In a desktop development run, request diagnostics go to the launcher log.

In the project operations view, expand ECN-204 and select **Prepare DSH analysis draft**. DSH adds the demo evidence and your constraints to the current or most recent workspace’s new conversation draft. Review it before sending. Once sent, the standard DSH session tracks any native Subagents it starts.

In **Project manager → Today’s work**, open **Review risk** to rehearse MS-017. Generate the mock analysis, approve the recommended plan, simulate dispatch, and accept the simulated replies. The closed case and decision record remain under tracking. The alert, evidence IDs and allowed transitions live in the milestone mock; connect them to authorized platform reads and commands when replacing the simulation.

- Positions have six charts; company management and the vehicle business president have eight: trends, progress, business mix, plan comparison, weekly completions and risk matrices, plus management collections and resource coverage. New charts open raw data details and a related task.
- Switch all 19 position views: the assistant inbox and position dashboard adapt to the selected role, while shared navigation stays available. Company management and the vehicle business president can open the position responsible for a summarized risk.
- Review company priorities with synthetic values, sources, owners and next actions; the list opens on work assigned to the active position, with a switch to the full company list and its KPI workflows.
- Run a local assistant-workflow simulation with a four-step plan, source and KPI evidence, cross-position review, an editable recommendation and a human approval step. Confirmation updates only the associated browser-local demo work item.
- Save a position-specific assistant preference in the browser profile and review it beside the method, source evidence and proposed action for each run.
- Open any KPI-led scenario for a position; the assistant opens its typical task, applies that role's method, and prepares a draft for review. Each position also has three frequent work scenarios with visible four-step SOP flows and a direct assistant action.
- Today’s work puts the assistant’s top recommendation and its reason first, then lists other decisions, reviews and incoming deliveries. Actions open the associated SOP, delivery request or exact project record. Open the common work scenes to see when to start and what to deliver. Waiting and completed work and KPI scenarios are available below.
- Resume saved work from Today’s work: the selected position, SOP step, draft materials and handoff note remain available after navigating away or reloading this browser profile.
- All 57 role-task pairs have a suggested method, task-specific inputs, deliverables and acceptance criteria. Materials, analysis, results and review include method guidance, editable evidence notes and self-checks; saved versions include execution snapshots. The method library opens the corresponding task.
- Open a task, edit its recommendation, save a version, open its version history to compare snapshots, adopt a preset suggestion and simulate a review handoff.
- Select a calendar date and add a local event; switch position views without losing that event or notification read state.
- Create project, supervision or topic workgroups; invite position assistants, post work arrangements, exchange local messages and revisit each group's history. Assigned positions submit a delivery record before the work owner reviews the linked task. Assistant replies are scripted demonstrations.
- Open the project operations console to select a project, inspect linked milestones and dependencies, review detected changes and risk evidence, record a decision option, complete accountable actions and pass acceptance only after required actions are verified.
- Open Position operations from an assistant alert or the role dashboard. Each of the 17 other positions and company management has a source record, a metric comparison, two response options and a linked SOP. Confirm a plan to create a workgroup assignment. Switch to the delivering position to submit evidence from its inbox, then return to the initiating position to request revision or record acceptance against the scenario criteria. The group retains the assignment, submissions and review history.
- Review demonstration materials in Files; track group assignment, position delivery and owner review as separate steps.
- Ask for company business data (customers, suppliers, projects, quality and more) in the conversation: the assistant first searches a read-only API catalog, then queries live with the signed-in employee's identity and active tenant, trimming the result to a bounded number of rows. When the catalog has no matching capability it says so. Reads only; no edits or exports.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The manifest declares both `dsh.bundle.patch` and `dsh.client`. The patch inserts the Host carrier; its browser entry registers a keyed `main` panel and a `sidebar.panellist` launcher through Cordis effects, then selects the workbench. A fullscreen, headless DSH Modal presents its interface and owns keyboard focus; nested dialogs close before the workbench on Escape. It uses DSH locale dictionaries, theme tokens, shared controls and a declared store. Unloading the plugin removes its registrations. It does not replace the DSH root, inject HTML into its document or serve a separate application.

| File | Responsibility |
|---|---|
| [Manifest](package.json) | Bundle and browser exports |
| [Patch](dsh/cordis.patch.yml) | Workbench activation row |
| [Browser entry](src/client/index.ts) | Lifecycle-owned registrations |
| [Workbench](src/client/app/Workbench.tsx) | Position and common views |
| [Store](src/client/core/model.ts) | Browser-local workbench state and saved snapshots |
| [Modules](src/client/modules/) | One directory per navigation module (screen, locales, public index) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Experimental packages](../README.md#status)
- [Client slots](../../client/ui-slots/README.md)
- [Design draft](../../../docs/scratch/shaoshi-workbench/design.md)

<a id="model-experience"></a>
## Model Experience

The conversation registers two host tools. `yuanshu_api_search` searches a build-time read-only API catalog (894 GET operations at present) by business term and returns paths, summaries and parameters; `yuanshu_api_query` queries one catalog path with the signed-in employee's credential and active tenant, bounding returned rows and output length. Tool declarations and the catalog are fixed when the plugin loads. The employee token stays inside the host and never reaches model context or tool results. The catalog is generated from the Swagger snapshot by the [generator script](scripts/generate-api-catalog.mjs); rerun it when the backend contract changes.

#### KV Cache effect

Workbench navigation and draft edits do not change model requests or their cache. Query arguments vary per call without changing the tool declarations themselves.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Position selection demonstrates presentation adaptation; it grants no identity or business permissions. Company management is an added demonstration view, not a database position. Project management has no configured KPIs; its charts show demonstration progress.
- Chart values, materials and scheduled dates are synthetic. They are not validated KPI formulas or live operational results.
- Handoffs and notifications are local simulations; no external messages are sent and no platform tasks or approvals are created. Workgroup membership, arrangements and message history stay in the browser profile.
- Assistant plans, position delivery records and approval outcomes are scripted demonstrations; no model or MCP tool is called, and delivery does not create or update platform data.
- Position preferences are browser-local prototype context; they are not sent to a model or YuanShu.
- The 16 suggested methods require business approval before use as formal procedures. Self-checks record user assertions; incomplete work can be handed off with visible gaps and is never automatically approved.
- Demo records persist only in this browser profile and are not synchronized across devices or stored as YuanShu business records. YuanShu MCP integration and durable business state are outside this prototype.

<a id="dev-note"></a>
### Dev Note

### Daily and weekly report receipts

Failed report submissions remain available in the workbench todo list with their saved form data, edit action, and retry action. The workbench displays server-confirmed success or the returned failure message.

### Equipment intake and service catalog

The business-record creation skill discovers current backend actions from the refreshed service catalog. The workbench checks the signed-in employee's permissions, builds a review form from the declared request fields, and submits only after confirmation.

The shared workflow and field definitions are documented in the [daily and weekly report skill](skills/yuanshu-work-report/SKILL.md), [daily report field contract](src/plugins/yuanshu-work-records/日报字段契约.md), [weekly report field contract](src/plugins/yuanshu-work-records/周报字段契约.md), [business record creation skill](skills/yuanshu-business-record-create/SKILL.md), and [work record implementation notes](docs/work-records.md).

<details>
<summary>Working context for maintainers — click to expand</summary>

This package is an experimental plugin prototype on `dev`, intended for interface review before platform integration.

</details>

To enable live work, configure the workbench MCP entry with the employee endpoint, OAuth client ID, and YuanShu cloud API base URL (`apiUrl`). The Host verifies the signed-in employee and tenant before reading workbench data. It retains only the verified employee and tenant IDs until the profile expires or the MCP connection generation changes; each workbench projection uses YuanShu authorization. Business-data routes and personal task/calendar REST calls use the cloud API base URL configured by `YUANSHU_REMOTE_API_URL`. For each tenant that uses automatic connection, allow the registered DSH client in YuanShu’s `client_mcp.preauthorized_clients`. When the signed-in user opens Today’s work, DSH obtains a read-only grant for the selected tenant.

Register the exact DSH callback on the YuanShu OAuth client. On a Host advertised as `http://127.0.0.1:3080`, the callback is `http://127.0.0.1:3080/mcp/oauth/callback/56a411dab576919cbca52fcfee03f1a34ff9b37d4858c71c781c9005942ac59f`.
