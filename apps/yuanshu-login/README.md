# 元枢平台登录页 (YuanShu Login)

独立 Vue 登录页面，用于通过浏览器登录元枢平台并获取认证 token。

## 快速开始

```bash
# 开发模式
pnpm dev

# 构建
pnpm build

# 预览构建产物
pnpm preview
```

## 工作流程

1. 打开浏览器访问 `http://localhost:3005/login`
2. 输入用户名和密码登录
3. 登录成功后，token 文件自动下载
4. 将 token 文件保存到 `~/.dsh/yuanshu-token`
5. 重启 DSH CLI（使用 yuanshu profile），即可使用 `yuanshu_qa` 工具

## Token 配置（三种方式，优先级从高到低）

1. **配置文件** — 在 `cordis.patch.yml` 中设置：
   ```yaml
   - id: yuanshu-qa-tool
     name: '@deepseek-ai/dsh-yuanshu-qa-tool'
     config:
       baseURL: http://localhost:8081
       token: <your-token>
   ```

2. **环境变量** — 设置 `YUANSHU_TOKEN` 环境变量

3. **共享 token 文件** — 将 token 保存到 `~/.dsh/yuanshu-token`
   （登录页面下载的文件可直接使用）

## 技术栈

- Vue 3 (Composition API)
- TDesign Vue Next
- Pinia
- Axios
- Vite
- TypeScript

## 与 YuanShu 客户端的集成

登录页的 token 会自动写入：
- `localStorage.yuanshu-token` — 浏览器端使用
- `localStorage.workbench-client-token` — 向后兼容
- 下载文件 `~/.dsh/yuanshu-token` — CLI 端使用
