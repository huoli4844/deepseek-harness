/** 技能市场数据层：同源代理请求与响应归一化，不依赖 React。 */

/** 三个列表分页签。 */
export type SkillsSection = 'skills' | 'sources' | 'packages'

/** 一行技能/来源/包的展示字段，原始对象保留给详情弹窗。 */
export interface SkillItem {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly status: string
  readonly description: string
  readonly updatedAt: string
  readonly raw: unknown
}

/** 请求错误类别：401 映射为登录提示，其余归为加载失败。 */
export type SkillsErrorKind = 'login' | 'failed'

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return Reflect.get(value, key) as unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function identifier(value: unknown): string {
  if (typeof value === 'string') return value
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

/** 从 `{code,message,data}` 中取业务数据；缺省时退回整个响应体。 */
function payloadOf(value: unknown): unknown {
  return field(value, 'data') ?? value
}

/** 依次尝试 list、items 与直接数组，兼容后台不同列表包装。 */
function listOf(value: unknown): readonly unknown[] {
  const data = payloadOf(value)
  if (Array.isArray(data)) return data
  for (const key of ['list', 'items', 'rows']) {
    const list = field(data, key)
    if (Array.isArray(list)) return list
  }
  return []
}

function parseItem(value: unknown): SkillItem {
  const nameKeys = ['name', 'title', 'skill_name', 'package_name', 'slug']
  const versionKeys = ['version', 'latest_version', 'revision', 'release_version']
  const statusKeys = ['status', 'state', 'publish_status']
  const updatedKeys = ['updated_at', 'updatedAt', 'created_at', 'published_at']
  const first = (keys: readonly string[]): string => {
    for (const key of keys) {
      const candidate = text(field(value, key))
      if (candidate !== '') return candidate
    }
    return ''
  }
  return {
    id: identifier(field(value, 'id')) || first(['slug', 'name', 'title']),
    name: first(nameKeys),
    version: first(versionKeys),
    status: first(statusKeys),
    description: first(['description', 'summary', 'intro']),
    updatedAt: first(updatedKeys),
    raw: value,
  }
}

/** 把列表响应归一化为展示行。 */
export function rowsFromPayload(value: unknown): readonly SkillItem[] {
  return listOf(value).map(parseItem)
}

/** 读取员工令牌与当前租户，缺失令牌时直接报登录类别。 */
function headers(accept: string): Headers {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { status: 401, kind: 'login' satisfies SkillsErrorKind })
  return new Headers({
    authorization: `Bearer ${token}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
    accept,
  })
}

/** 请求错误类别。 */
export function requestErrorKind(error: unknown): SkillsErrorKind {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'kind') === 'login' ? 'login' : 'failed'
}

/** 同源 JSON 请求：成功返回响应体，失败按状态分类。 */
async function request(path: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  const requestHeaders = headers('application/json')
  for (const [key, value] of Object.entries(init.headers ?? {})) requestHeaders.set(key, String(value))
  const response = await fetch(`/yuanshu-skills/${path}`, {
    ...init,
    headers: requestHeaders,
    signal,
  })
  if (!response.ok) {
    throw Object.assign(new Error('YuanShu skills request failed'), {
      status: response.status,
      kind: response.status === 401 ? 'login' : 'failed',
    })
  }
  return response.json()
}

/** 读取指定分页签的列表。 */
export async function fetchSection(section: SkillsSection, signal: AbortSignal): Promise<readonly SkillItem[]> {
  const path = section === 'skills' ? 'skills' : section === 'sources' ? 'skill-sources' : 'skill-packages'
  return rowsFromPayload(await request(path, { method: 'GET' }, signal))
}

/** 安装技能来源；后台字段以实测为准，这里传 source 与 ref。 */
export async function installFromSource(source: string, ref: string, signal: AbortSignal): Promise<void> {
  await request('skills/install-from-source', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ref === '' ? { source } : { source, ref }),
  }, signal)
}

/** 以原始文件流导入技能包，保留浏览器生成的 multipart 边界。 */
export async function importPackage(file: File, signal: AbortSignal): Promise<void> {
  const body = new FormData()
  body.append('file', file, file.name)
  await request('skills/import-package', { method: 'POST', body }, signal)
}

/** 下载技能包，返回字节与文件名。 */
export async function downloadPackage(id: string, signal: AbortSignal): Promise<{ readonly blob: Blob; readonly name: string }> {
  const response = await fetch(`/yuanshu-skills/skills/${encodeURIComponent(id)}/export-package`, {
    headers: headers('*/*'),
    signal,
  })
  if (!response.ok) {
    throw Object.assign(new Error('YuanShu skills download failed'), {
      status: response.status,
      kind: response.status === 401 ? 'login' : 'failed',
    })
  }
  const disposition = response.headers.get('content-disposition') ?? ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/iu.exec(disposition)
  return { blob: await response.blob(), name: match?.[1] ?? `${id}.zip` }
}
