# Agent Note: YuanShu ontology context for DSH

Status: implemented

English | [中文](2026-11-15-yuanshu-ontology-agent-context.zh.md)

## Problem

DSH discovers YuanShu tools through MCP, but an Agent needs the published ontology's object and field meanings before it can form a useful query. Collection reads also need an explicit authorized space, and runtime audit samples are not document citations.

## Decision

The catalog sequence starts with `ontology_spaces`, then reads collections and releases using the selected space. The Agent reads `ontology_context` for a fixed published release before querying. That context includes object fields, relations, and the runtime's supported query capabilities, while omitting datasource and table mappings. Existing consumer bindings and platform row policies still authorize every query.

`ontology_evidence` describes release-scoped runtime traces, Action executions, and governance ledger samples. It is not knowledge evidence; `knowledge_search` remains the document citation path. The request schema follows the handler DTO and rejects the obsolete `evidence_id` field.

## Alternatives considered

**Return only asset references.** An Agent cannot infer field meanings or form an object query from references alone. Published semantic descriptions let the Agent compose the query while the existing runtime validates it.

**Copy ontology and permission definitions into DSH.** Duplicate definitions drift and expand client responsibility. YuanShu retains publication, consumer bindings and row policy; DSH consumes the authorized catalog.

## Consequences

Discovery results include ontology usage instructions, while selected tools and results remain in the original Session log. Catalog reads and data queries retain separate responsibilities; understanding published semantics does not grant row access.

## Verification

Focused server tests exercise the original collection, context, and evidence handlers against isolated tenant fixtures, validate input and output schemas, and reject cross-tenant release reads. DSH tests cover SDK parameter forwarding, gateway validation, space switching and stale-response suppression in the workbench. This note does not establish customer-data goldens or production rollout acceptance.
