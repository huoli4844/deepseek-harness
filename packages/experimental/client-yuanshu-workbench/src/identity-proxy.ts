/**
 * 身份与个人资料的同源只读代理（host 侧）。
 *
 * 浏览器只持有工作台会话令牌，不能直连元枢后台；本模块把三个已存在的后台端点
 * 映射为同源 GET 路由，交由浏览器侧数据层调用。这里不含任何界面文案或展示逻辑。
 */

/** 代理所需的最小请求结构，避免把 host 框架类型泄漏进本模块。 */
interface ProxyRequest {
  readonly url?: string | undefined
  readonly method?: string | undefined
}

/** 代理所需的最小响应结构。 */
interface ProxyResponse {
  writeHead(status: number, headers: Record<string, string>): unknown
  end(body?: string | Uint8Array): unknown
}

/** 项目编码白名单：仅允许业务编码常用字符，防止路径注入。 */
const PROJECT_CODE = /^[A-Za-z0-9_-]{1,64}$/u

/** 默认项目编码：后台工时接口要求路径参数，未显式指定时使用少仕示例项目。 */
const DEFAULT_PROJECT_CODE = 'EP220501'

/**
 * 把同源路径解析为后台真实地址；未知路径返回 undefined。
 * @param incoming - 浏览器请求。
 * @param api - 元枢后台 API 根地址（不带末尾斜杠）。
 * @returns 后台地址，或 undefined 表示路由不存在。
 */
function upstreamUrl(incoming: ProxyRequest, api: string): URL | undefined {
  const url = new URL(incoming.url ?? '/', 'http://localhost')
  const endpoint = url.pathname.slice('/yuanshu-workbench/identity/'.length)
  if (endpoint === 'me') return new URL(`${api}/api/v1/user/me`)
  if (endpoint === 'profile') return new URL(`${api}/api/v1/apps/shaoshi/workbench/profile`)
  if (endpoint === 'labor-hours') {
    const code = url.searchParams.get('code') ?? DEFAULT_PROJECT_CODE
    if (!PROJECT_CODE.test(code)) return undefined
    return new URL(`${api}/api/v1/apps/shaoshi/projects/${encodeURIComponent(code)}/labor-hours`)
  }
  return undefined
}

/**
 * 代理一个身份类 GET 请求；响应体与状态码原样透传，便于客户端按既有契约解析。
 * @param req - 浏览器请求。
 * @param res - 浏览器响应。
 * @param api - 元枢后台 API 根地址。
 * @param authorization - 浏览器携带的后台 Bearer 凭证。
 * @param activeTenant - 当前租户编码。
 * @param signal - 请求生命周期信号。
 */
export async function proxyIdentityRequest(
  req: ProxyRequest,
  res: ProxyResponse,
  api: string,
  authorization: string,
  activeTenant: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  const send = (status: number): void => {
    res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
    res.end('{}')
  }
  if ((req.method ?? 'GET') !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' })
    res.end()
    return
  }
  const remote = upstreamUrl(req, api)
  if (remote === undefined) {
    send(404)
    return
  }
  const headers: Record<string, string> = { authorization, accept: 'application/json' }
  if (activeTenant !== undefined && activeTenant !== '') headers['X-Active-Tenant'] = activeTenant
  const response = await fetch(remote, { headers, signal, redirect: 'error' })
  const body = new Uint8Array(await response.arrayBuffer())
  res.writeHead(response.status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}
