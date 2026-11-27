/** 登录时预取当前员工的权限，不依赖 MCP 状态，不向浏览器返回凭证。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { EmployeeAccessStore } from './employee-access.ts'
import { YuanShuIdentityUnavailable, YuanShuSessionExpired } from './employee.ts'

/** 注册同源的权限初始化与读取端点。 */
export function registerEmployeeAccess(ctx: Context, store: EmployeeAccessStore): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/yuanshu-workbench/employee-access',
    auth: 'required',
    async handler(req, res) {
      const send = (status: number, data?: object) => {
        res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
        res.end(data === undefined ? undefined : JSON.stringify({ data }))
      }
      if (req.method !== 'POST') {
        send(405)
        return
      }
      if (req.headers['sec-fetch-site'] !== 'same-origin') {
        send(403)
        return
      }
      const { authorization, 'x-active-tenant': tenant } = req.headers
      if (!authorization || !/^Bearer [^\s]+$/u.test(authorization) ||
          typeof tenant !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(tenant)) {
        send(401)
        return
      }
      try {
        const access = await store.read(authorization, tenant)
        if (access.roles === null || access.permissions === null) {
          ctx.logger.warn('元枢权限同步返回不完整的角色或权限')
        } else {
          ctx.logger.info('元枢员工权限已同步，共 %s 个角色、%s 项权限', access.roles.length, access.permissions.length)
        }
        send(200, access)
      } catch (error) {
        const status = error instanceof YuanShuSessionExpired ? 401
          : error instanceof YuanShuIdentityUnavailable && error.upstream === 403 ? 403 : 502
        ctx.logger.warn('元枢权限同步失败，状态 %s', status)
        send(status)
      }
    },
  }), 'yuanshu: employee access')
}
