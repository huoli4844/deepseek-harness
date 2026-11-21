# YuanShu platform login

English | [中文](README.zh.md)

A Vue sign-in page served by the YuanShu login server in the Harness Web application.

## Build

```sh
pnpm --filter @deepseek-ai/yuanshu-login run build
```

The workspace Web build also builds this app. Both commands write `dist/`, which the login server serves at `/login`.

## Login flow

1. Open the Harness Web application and follow its sign-in redirect to `/login`.
2. With a platform account, sign in and select an authorized tenant. With a tenant account, select the tenant before signing in. Complete any requested second factor.
3. The page saves the token and account profile in browser storage, then sends the bearer token to `/yuanshu-token`.
4. After the Host verifies that token with YuanShu, the page follows the returned authenticated Harness URL.

If the handoff fails, the page shows an error and keeps the sign-in page open. Browser credentials stay in the browser; signing in does not configure CLI tools.

## Browser storage

- `yuanshu-token` — bearer token used by browser requests.
- `workbench-client-token` — token key shared with existing browser clients.
- `yuanshu-user` — cached username and nickname for the sidebar account entry.
