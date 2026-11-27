/** 资料库后台路由映射：限定路径与方法，不访问网络。 */

/** 只读查询路由：知识库集合/文档与外部存储状态。 */
export const DOCLIB_ROUTES: Readonly<Record<string, string>> = {
  '/yuanshu-doclib/collections': '/api/v1/knowledge-bases/collections',
  '/yuanshu-doclib/documents': '/api/v1/knowledge-bases/documents',
  '/yuanshu-doclib/storage/config': '/api/v1/files/storage/external/config',
  '/yuanshu-doclib/storage/health': '/api/v1/files/storage/external/health',
}

/** 文档详情路由：按文档 ID 转发，ID 由元枢生成（字母数字与连字符）。 */
const DOCLIB_DOCUMENT_ROUTE = /^\/yuanshu-doclib\/documents\/([A-Za-z0-9_-]+)$/u

/** 原文预览路由：按文件 ID 转发到元枢文件预览接口，返回原始字节流。 */
const DOCLIB_PREVIEW_ROUTE = /^\/yuanshu-doclib\/files\/([A-Za-z0-9_-]+)\/preview$/u

/** 路由决策：转发类别与方法约束。 */
export type DoclibProxyDecision =
  | { readonly type: 'read'; readonly remote: string }
  | { readonly type: 'write'; readonly remote: string }
  | { readonly type: 'preview'; readonly remote: string }
  | { readonly type: 'upload'; readonly remote: string }
  | { readonly type: 'method'; readonly allow: string }

/**
 * 解析资料库代理路径与请求方法。
 * 知识库与存储状态只允许 GET；文档支持 GET/DELETE，导入与上传只允许 POST；
 * NAS 配置允许 GET/PUT；其余路径返回 undefined，已知路径但方法不匹配返回 method 决策。
 */
export function doclibProxyRoute(pathname: string, method: string): DoclibProxyDecision | undefined {
  if (pathname === '/yuanshu-doclib/documents/ingest') {
    if (method !== 'POST') return { type: 'method', allow: 'POST' }
    return { type: 'write', remote: '/api/v1/knowledge-bases/documents/ingest' }
  }
  if (pathname === '/yuanshu-doclib/files/upload') {
    if (method !== 'POST') return { type: 'method', allow: 'POST' }
    return { type: 'upload', remote: '/api/v1/files/upload' }
  }
  const document = DOCLIB_DOCUMENT_ROUTE.exec(pathname)
  if (document !== null) {
    const remote = `/api/v1/knowledge-bases/documents/${document[1]}`
    if (method === 'GET') return { type: 'read', remote }
    if (method === 'DELETE') return { type: 'write', remote }
    return { type: 'method', allow: 'GET, DELETE' }
  }
  const preview = DOCLIB_PREVIEW_ROUTE.exec(pathname)
  if (preview !== null) {
    if (method !== 'GET') return { type: 'method', allow: 'GET' }
    return { type: 'preview', remote: `/api/v1/files/${preview[1]}/preview` }
  }
  if (pathname === '/yuanshu-doclib/storage/config') {
    if (method === 'PUT') return { type: 'write', remote: '/api/v1/files/storage/external/config' }
    if (method === 'GET') return { type: 'read', remote: '/api/v1/files/storage/external/config' }
    return { type: 'method', allow: 'GET, PUT' }
  }
  const target = DOCLIB_ROUTES[pathname]
  if (target === undefined) return undefined
  if (method !== 'GET') return { type: 'method', allow: 'GET' }
  return { type: 'read', remote: target }
}
