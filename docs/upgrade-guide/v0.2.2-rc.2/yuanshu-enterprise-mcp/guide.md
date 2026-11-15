---
kind: upgrade-guide
description: "YuanShu enterprise calls now require user-authorized MCP instead of instance-wide HTTP credentials."
---

# YuanShu Enterprise MCP Authorization

English | [中文](guide.zh.md)

## Change

The YuanShu profile now routes enterprise capabilities through MCP by default and requires an OAuth grant for the active DSH user and tenant. Instance-wide bearer tokens and token-file fallbacks are rejected in MCP mode; MCP failures do not replay through HTTP.

Task controls now use the returned `task_ref` with `task_get`, `task_result`, `task_events`, `task_cancel`, and `task_resume`; workflow and Action approvals use `task_approvals` and `task_approve`. Default discovery hides engine-specific tools marked with a compatibility replacement. Explicit authorized legacy calls remain available.

## Migration

1. Remove `token` from `@deepseek-ai/dsh-yuanshu-gateway` and `@deepseek-ai/dsh-yuanshu-tool` configuration.
2. Set `enterpriseTransport: mcp`, configure the registered `mcpClientId`, `mcpIssuer`, `mcpResource`, and loopback `mcpRedirectUri` when platform defaults do not match, and register that redirect URI with the authorization server.
3. Keep login and file-transfer HTTP settings separate from MCP grants, then authorize each DSH user through Authorization Code + PKCE.
4. Keep the base bundle's `session-persistence-jsonl` provider enabled so workspaces, Session controllers, and local recovery can activate. Start the repository integration with `pnpm dsh web --patch apps/cli/config/profiles/yuanshu/cordis.patch.yml`; the patch is not a shipped profile template. The Web profile retains valid Host cookies across restarts; set `freshBrowserSession: true` on its `authentication-token` row only when every launch must require browser sign-in. MCP grants remain independently validated.
5. Confirm the gateway reports `enterpriseTransport: mcp`, the user can discover authorized tools, and a second user receives an independent catalog.
6. For an approved rollback window only, set `enterpriseTransport: legacy-http` and provide a user-scoped token; restore MCP mode after the legacy route is repaired.

7. Upgrade the YuanShu backend with the unified task adapters before this DSH client. Preserve returned `task_ref` values and use `available_operations`; do not infer a query or cancel tool from an asset name. Verify a completed result and approval recovery after reload. Existing display locators convert on read without resubmission.
