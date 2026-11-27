/** 技能市场后台路由映射：限定路径与方法，不访问网络。 */

/** 技能 ID：元枢生成，字母数字、下划线、连字符与点号。 */
const SKILL_ID = /^\/yuanshu-skills\/skills\/([A-Za-z0-9._-]+)\/(export-package|package)$/u

/** 路由决策：转发类别与方法约束。 */
export type SkillsProxyDecision =
  | { readonly type: 'read'; readonly remote: string }
  | { readonly type: 'binary'; readonly remote: string }
  | { readonly type: 'write'; readonly remote: string }
  | { readonly type: 'upload'; readonly remote: string }
  | { readonly type: 'method'; readonly allow: string }

/** 只读列表路由。 */
const LIST_ROUTES: Readonly<Record<string, string>> = {
  '/yuanshu-skills/skills': '/api/v1/skills',
  '/yuanshu-skills/skill-sources': '/api/v1/skill-sources',
  '/yuanshu-skills/skill-packages': '/api/v1/skill-packages',
}

/**
 * 解析技能市场代理路径与请求方法。
 * 列表只允许 GET；安装来源与导入包只允许 POST；导出包返回二进制。
 * 未知路径返回 undefined，已知路径但方法不匹配返回 method 决策。
 * @param pathname - 同源请求路径。
 * @param method - HTTP 方法。
 * @returns 转发决策。
 */
export function skillsProxyRoute(pathname: string, method: string): SkillsProxyDecision | undefined {
  const skill = SKILL_ID.exec(pathname)
  if (skill !== null) {
    if (method !== 'GET') return { type: 'method', allow: 'GET' }
    const id = skill[1] ?? ''
    return {
      type: 'binary',
      remote: skill[2] === 'export-package'
        ? `/api/v1/skills/${id}/export-package`
        : `/api/v1/client/skills/${id}/package`,
    }
  }
  if (pathname === '/yuanshu-skills/skills/install-from-source') {
    if (method !== 'POST') return { type: 'method', allow: 'POST' }
    return { type: 'write', remote: '/api/v1/skills/install-from-source' }
  }
  if (pathname === '/yuanshu-skills/skills/import-package') {
    if (method !== 'POST') return { type: 'method', allow: 'POST' }
    return { type: 'upload', remote: '/api/v1/skills/import-package' }
  }
  const target = LIST_ROUTES[pathname]
  if (target === undefined) return undefined
  if (method !== 'GET') return { type: 'method', allow: 'GET' }
  return { type: 'read', remote: target }
}
