# 元枢平台登录页 (YuanShu Login)

[English](README.md) | 中文

独立 Vue 登录页面，用于通过浏览器登录元枢平台并获取认证 token。

## 快速开始

```bash
# Development
pnpm dev

# Build
pnpm build

# Preview the build
pnpm preview
```

## 工作流程

1. 打开浏览器访问 `http://localhost:3005/login`。
2. 输入元枢用户名和密码。
3. 登录成功后，登录页会下载 token 文件。
4. 将 token 文件保存到 `~/.dsh/yuanshu-token`。
5. 重启 DSH CLI 并使用 `yuanshu` profile，即可使用 `yuanshu_qa` 工具。

## Token 配置

插件按以下优先级读取凭据：

1. **插件配置** — 在 `cordis.patch.yml` 中设置 `token`：
   ```yaml
   - id: yuanshu-qa-tool
     name: '@deepseek-ai/dsh-yuanshu-qa-tool'
     config:
       baseURL: http://localhost:8081
       token: <your-token>
   ```

2. **环境变量** — 设置 `YUANSHU_TOKEN`。

3. **共享 token 文件** — 将 token 保存到 `~/.dsh/yuanshu-token`。登录页下载的文件可直接使用。

## 技术栈

- Vue 3 (Composition API)
- TDesign Vue Next
- Pinia
- Axios
- Vite
- TypeScript

## 与 YuanShu 客户端的集成

登录页会将 token 保存在以下位置：
- `localStorage.yuanshu-token` — browser requests
- `localStorage.workbench-client-token` — backward compatibility
- Downloaded `~/.dsh/yuanshu-token` file — CLI requests
