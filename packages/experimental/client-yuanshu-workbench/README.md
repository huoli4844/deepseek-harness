---
description: "Use the Shaoshi workbench to review a role-aware assistant inbox, position dashboards and shared work views."
kind: "package-bundle"
---

# @deepseek-ai/dsh-client-yuanshu-workbench

English | [中文](README.zh.md)

## Summary

Inside DSH Web, this bundle opens a role-aware assistant inbox with position focus, assigned work and schedule actions. Role dashboards provide charts; the project position also has a project operations console that links portfolio health, changes, dependencies, risks, decisions, actions and acceptance gates. 18 positions and company management each have four KPI-led scenarios and three daily tasks linked to work methods. Workgroups organize project and supervision conversations with position assistants and browser-local history. All records are demonstrations saved in this browser profile. The bundle does not connect to YuanShu MCP, call a model or persist data through the Host.

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

After building the checkout, run the Web profile from the root of the `dev` branch. The source launcher adds the workbench bundle before applying your Web profile patches.

```sh
pnpm run build
pnpm dsh web
```

Open the local entry URL printed by DSH. Loading the plugin opens **YuanShu workbench** on **Today’s work**, with only its own navigation and content visible. The page surfaces the next action and its reason for the selected role; **Position dashboard** opens charts and comparisons. Return to the original DSH interface with the workbench footer button; the current Session remains selected. Demo records persist in this browser profile across page refreshes and plugin reloads; clearing site data removes them.

### What you can try

In the project operations view, expand ECN-204 and select **Prepare DSH analysis draft**. DSH adds the demo evidence and your constraints to the current or most recent workspace’s new conversation draft. Review it before sending. Once sent, the standard DSH session tracks any native Subagents it starts.

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

This package is an experimental plugin prototype on `dev`, intended for interface review before platform integration.

</details>
