---
description: "Install an optional Shaoshi workbench with role-specific charts and shared task, version, calendar, collaboration and notification views."
kind: "package-bundle"
---

# @deepseek-ai/dsh-client-yuanshu-workbench

English | [中文](README.zh.md)

## Summary

This optional bundle adds YuanShu workbench to the native DSH sidebar. All 18 positions verified in the design document have distinct demonstration charts, tasks, materials and methods. An additional company management view summarizes operating collections, delivery, quality, supply and organizational risks, with links to responsible positions. The selector groups these 19 views by management, engineering, production, market and support responsibilities. Every position has tasks, saved versions, a calendar, team collaboration, notifications, materials and methods. All business records live in browser memory; the bundle contributes no platform integration, model calls or Host persistence.

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

Open the local entry URL printed by DSH. Loading the plugin opens **YuanShu workbench** directly, with only its own navigation and content visible. The isolated profile has its own model configuration and history. Return to the original DSH interface with the workbench footer button; the current Session remains selected. Reopening the workbench retains its demo drafts until page refresh or plugin reload.

### What you can try

- Positions have six charts; company management and the vehicle business president have eight: trends, progress, business mix, plan comparison, weekly completions and risk matrices, plus management collections and resource coverage. New charts open raw data details and a related task.
- Switch all 19 views: charts, focus items, tasks, materials and methods change; shared navigation stays available. Company management and the vehicle business president can open the position responsible for a summarized risk.
- All 57 role-task pairs have a suggested method, task-specific inputs, deliverables and acceptance criteria. Materials, analysis, results and review include method guidance, editable evidence notes and self-checks; saved versions include execution snapshots. The method library opens the corresponding task.
- Open a task, edit its recommendation, save a version, compare snapshots, adopt a preset suggestion and simulate a review handoff.
- Select a calendar date and add a local event; switch position views without losing that event or notification read state.
- Review shared materials and position responsibilities through the Files and Team pages.

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
| [Store](src/client/model.ts) | Local drafts and saved snapshots |

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
- Handoffs and notifications are local simulations; no messages are sent and no platform tasks or approvals are created.
- The 16 suggested methods require business approval before use as formal procedures. Self-checks record user assertions; incomplete work can be handed off with visible gaps and is never automatically approved.
- Refreshing the page or reloading the plugin discards demo records. YuanShu MCP integration and durable business state are outside this prototype.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This package is an opt-in plugin prototype on `dev`, intended for interface review before platform integration.

</details>
