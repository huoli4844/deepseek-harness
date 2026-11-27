---
description: "Browse and install YuanShu skills from a DSH sidebar panel."
kind: "package-bundle"
---

# @deepseek-ai/dsh-yuanshu-skills

## Summary

This panel lists skills, skill sources and skill packages published by YuanShu, and lets a signed-in employee install a skill from a source address, import a skill package file and download an exported package. The Host forwards every request to the YuanShu REST API with the employee's bearer token and active tenant; the browser only calls same-origin `/yuanshu-skills/*` routes.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Add a `yuanshu-skills` row with `apiUrl` on the DSH profile, sign in to YuanShu, then open **Skills market** in the sidebar. The three tabs read `GET /api/v1/skills`, `GET /api/v1/skill-sources` and `GET /api/v1/skill-packages`. **Install from source** posts to `/api/v1/skills/install-from-source`, **Import package** posts the chosen file to `/api/v1/skills/import-package`, and **Download** streams `/api/v1/skills/{id}/export-package`.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/skills-proxy.ts` maps the eight same-origin routes to YuanShu paths and rejects other methods.
- `src/index.ts` registers the prefix route on the Host web server, forwards `Authorization` and `X-Active-Tenant`, and passes binary downloads through unchanged.
- `src/client/skills-store.ts` is the only request layer; it normalizes `data.list`, `data.items` and plain arrays.
- `src/client/SkillsMarket.tsx` renders the tabs, the install and import dialogs, the raw detail dialog and the download action.

## Model Experience

None, as this package renders Host data in the browser and adds nothing to model requests.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The first version does not publish, edit or execute skills; it only browses, installs, imports and exports.
- List fields are read defensively because the YuanShu OpenAPI schema for these routes is generic; the detail dialog shows the raw record.
