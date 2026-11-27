/** 登录后预取服务目录，与员工权限和 MCP 初始化分别运行。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { createSwaggerLookup } from './swagger-create-catalog.ts'

/** 仅允许工作台同源请求刷新已配置的云端文档。 */
export function registerSwaggerLogin(ctx: Context, catalog: ReturnType<typeof createSwaggerLookup>): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/yuanshu-workbench/swagger-capabilities/login', auth: 'required',
    handler(req, res) {
      const { authorization, 'x-active-tenant': tenant } = req.headers
      const valid = req.headers['sec-fetch-site'] === 'same-origin' &&
        typeof authorization === 'string' && /^Bearer [^\s]+$/u.test(authorization) &&
        typeof tenant === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(tenant)
      if (req.method !== 'POST' || !valid) {
        res.writeHead(req.method !== 'POST' ? 405 : 403, { 'cache-control': 'no-store' }).end()
        return
      }
      void catalog.refresh().then((count) => {
        if (count === undefined) ctx.logger.warn('元枢 Swagger 服务目录同步失败')
        else ctx.logger.info('元枢 Swagger 服务目录已同步，共 %s 项操作', count)
      })
      res.writeHead(202, { 'cache-control': 'no-store' }).end()
    },
  }), 'yuanshu: discover Swagger after login')
}
