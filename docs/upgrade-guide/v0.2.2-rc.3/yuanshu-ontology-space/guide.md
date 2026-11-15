---
kind: upgrade-guide
description: "Ontology collection reads require an explicit space identifier."
---

# Select an ontology space before reading collections

English | [中文](guide.zh.md)

## Change

`YuanShuClient.listOntologyCollections(spaceId, limit?)` requires a positive space ID. Its previous optional first argument was a page size. The gateway rejects collection requests without a valid `space_id` instead of forwarding an incomplete request.

## Migration

1. Read `listOntologySpaces()` and select an authorized space ID.
2. Replace `listOntologyCollections(limit)` with `listOntologyCollections(spaceId, limit)`. For gateway calls, add `?space_id=<id>` to `/yuanshu-api/ontology/collections`.
3. Optionally pass that ID as the second argument to `listOntologyReleases(limit, spaceId)` or as the gateway release query parameter.
4. Confirm that the selected space returns its own collections and that a missing or invalid ID returns HTTP 400.
