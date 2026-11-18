---
description: "Install an optional Shaoshi workbench with a role-aware assistant inbox, position dashboards and shared work views."
kind: "package-bundle"
---

# @deepseek-ai/dsh-client-yuanshu-workbench

English | [中文](README.zh.md)

## Summary

Inside DSH, this bundle opens a role-aware assistant inbox with position focus, assigned work and schedule actions. Role dashboards provide charts; 18 positions and company management each have four KPI-led scenarios and three daily tasks linked to work methods. Workgroups organize project and supervision conversations with position assistants and browser-local history. All records are demonstrations saved in this browser profile. The bundle does not connect to YuanShu MCP, call a model or persist data through the Host.

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

### Preview from this checkout

From the repository root, build the checkout and install the local bundle into an isolated Web profile. The default DSH composition does not include this specialized workbench.

```sh
pnpm run build
DSH_HOME=/tmp/dsh-yuanshu-plugin-preview pnpm dsh plugin --profile web add "link:$PWD/packages/experimental/client-yuanshu-workbench"
DSH_HOME=/tmp/dsh-yuanshu-plugin-preview pnpm dsh --profile web --patch apps/web/tests/pin-browse-picker.overlay.yml --port 4317 --no-open
```

Open the local entry URL printed by DSH. Loading the plugin opens **YuanShu workbench** on **My assistant**, with only its own navigation and content visible. The inbox surfaces role focus, assigned work, and schedule items; **Position dashboard** opens charts and comparisons. The isolated profile has its own model configuration and history. Return to the original DSH interface with the workbench footer button; the current Session remains selected. Demo records persist in this browser profile across page refreshes and plugin reloads; clearing site data removes them.

### What you can try

- Positions have six charts; company management and the vehicle business president have eight: trends, progress, business mix, plan comparison, weekly completions and risk matrices, plus management collections and resource coverage. New charts open raw data details and a related task.
- Switch all 19 position views: the assistant inbox and position dashboard adapt to the selected role, while shared navigation stays available. Company management and the vehicle business president can open the position responsible for a summarized risk.
- Review company priorities with synthetic values, sources, owners and next actions; the list opens on work assigned to the active position, with a switch to the full company list and its KPI workflows.
- Run a local assistant-workflow simulation with a four-step plan, source and KPI evidence, cross-position review, an editable recommendation and a human approval step. Confirmation updates only the associated browser-local demo work item.
- Save a position-specific assistant preference in the browser profile and review it beside the method, source evidence and proposed action for each run.
- Open any KPI-led scenario for a position; the assistant opens its typical task, applies that role's method, and prepares a draft for review. Each position also has three frequent work scenarios with visible four-step SOP flows and a direct assistant action.
- Resume saved work from the assistant inbox: the selected position, SOP step, draft materials and handoff note remain available after navigating away or reloading this browser profile.
- All 57 role-task pairs have a suggested method, task-specific inputs, deliverables and acceptance criteria. Materials, analysis, results and review include method guidance, editable evidence notes and self-checks; saved versions include execution snapshots. The method library opens the corresponding task.
- Open a task, edit its recommendation, save a version, open its version history to compare snapshots, adopt a preset suggestion and simulate a review handoff.
- Select a calendar date and add a local event; switch position views without losing that event or notification read state.
- Create project, supervision or topic workgroups; invite position assistants, post work arrangements, exchange local messages and revisit each group's history. Assigned positions submit a delivery record before the work owner reviews the linked task. Assistant replies are scripted demonstrations.
- Review demonstration materials in Files; track group assignment, position delivery and owner review as separate steps.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The manifest declares both `dsh.bundle.patch` and `dsh.client`. The patch inserts the Host carrier; its browser entry registers a keyed `main` panel and a `sidebar.panellist` launcher through Cordis effects, then selects the workbench. A fullscreen, headless DSH Modal presents its interface and owns keyboard focus; nested dialogs close before the workbench on Escape. It uses DSH locale dictionaries, theme tokens, shared controls and a declared store. Unloading the plugin removes its registrations. It does not replace the DSH root, inject HTML into its document or serve a separate application.

| File | Responsibility |
|---|---|
| [Manifest](package.json) | Bundle and browser exports |
| [Patch](dsh/cordis.patch.yml) | Opt-in activation row |
| [Browser entry](src/client/index.ts) | Lifecycle-owned registrations |
| [Workbench](src/client/Workbench.tsx) | Position and common views |
| [Store](src/client/model.ts) | Browser-local workbench state and saved snapshots |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Experimental packages](../README.md#status)
- [Client slots](../../client/ui-slots/README.md)
- [Design draft](../../../docs/scratch/shaoshi-workbench/design.md)

<a id="model-experience"></a>
## Model Experience

None, as the workbench only renders local demonstration records and preset suggestions without contributing tools, prompts or Session events.

#### KV Cache effect

Workbench navigation and draft edits do not change model requests or their cache.

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

<details>
<summary>Working context for maintainers — click to expand</summary>

This package is an opt-in plugin prototype on `dev`, intended for interface review before platform integration.

</details>
