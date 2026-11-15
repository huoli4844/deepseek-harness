# Agent Note: YuanShu task references preserve original execution facts

Status: implemented

English | [中文](2026-11-14-yuanshu-original-task-contract.zh.md)

## Problem

A client that chooses recovery and cancellation by asset names must understand each platform execution engine. A second task ledger would also create competing answers about completion, authorization and approval.

## Decision

YuanShu returns an explicit `task_ref` for durable business executions. The client preserves that reference and uses the platform's unified task operations. The server routes each request through the original domain operation and checks current permissions. The reference identifies an existing execution; it grants no authority.

The [workbench](../../../../packages/client/ui-yuanshu-chat/README.md) restores only a reference owned by the current user and tenant. Its cancellation action follows the platform's advertised operations and terminal state. An unknown outcome remains unknown until an authorized read resolves it.

The [enterprise tool](../../../../packages/yuanshu/yuanshu-tool/README.md) and gateway omit compatibility aliases from default discovery. Explicit authorized legacy calls remain available during migration. Published business titles identify choices to users; stable invocation names and revisions retain their existing meaning.

## Alternatives considered

**Choose operations from asset-name prefixes.** Rejected because adding an engine would require another client branch, and internal scenario identifiers can differ from the authoritative Run identifier.

**Copy execution and approval state into DSH.** Rejected because the platform owns permissions, execution facts and workflow continuation. DSH retains a locator and presentation state.

**Remove old operations immediately.** Rejected because saved sessions and rollback configurations still use them. Discovery can prefer the unified operations while explicit compatibility calls remain authorized.

## Consequences

Clients depend on the platform contract rather than engine naming conventions. Unsupported operations fail explicitly. Deployment installs the backend contract before the client; rollback preserves original records and does not replay business writes. The existing user grant and tenant binding remain necessary on every request.

## Testing

Component tests cover title selection, restoration without resubmission, and cancellation visibility. Integration tests exercise the original PostgreSQL records, Docker results, current permissions and workflow approval through DSH's official MCP client. Browser acceptance covers independent approvers, reload recovery and cancellation through the unified contract.
