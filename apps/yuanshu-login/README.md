# YuanShu platform login

English | [中文](README.zh.md)

A standalone Vue login page for browser authentication with the YuanShu platform.

## Quick start

```bash
# Development
pnpm dev

# Build
pnpm build

# Preview the build
pnpm preview
```

## Login flow

1. Open `http://localhost:3005/login` in a browser.
2. Enter the YuanShu username and password.
3. The login page downloads a token file after successful authentication.
4. Save the token file to `~/.dsh/yuanshu-token`.
5. Restart the DSH CLI with the `yuanshu` profile to use the `yuanshu_qa` tool.

## Token configuration

1. **Plugin configuration** — set `token` in `cordis.patch.yml`:
   ```yaml
   - id: yuanshu-qa-tool
     name: '@deepseek-ai/dsh-yuanshu-qa-tool'
     config:
       baseURL: http://localhost:8081
       token: <your-token>
   ```

2. **Environment variable** — set `YUANSHU_TOKEN`.

3. **Shared token file** — save the token to `~/.dsh/yuanshu-token`.
   The file downloaded by the login page can be used directly.

## Technology

- Vue 3 (Composition API)
- TDesign Vue Next
- Pinia
- Axios
- Vite
- TypeScript

## YuanShu client integration

- `localStorage.yuanshu-token` — browser requests
- `localStorage.workbench-client-token` — backward compatibility
- Downloaded `~/.dsh/yuanshu-token` file — CLI requests
