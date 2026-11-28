/** 设置页技能包数据层：同源调用宿主代理完成清单、下载、安装与上传。 */

const BASE = '/yuanshu-workbench/skill-store'

/** 后台返回的技能包摘要，与宿主 SkillPackageSummary 对齐。 */
export interface SkillPackageEntry {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version?: string
  readonly status?: string
  readonly category?: string
  readonly updatedAt?: string
}

/** 请求失败：保留状态码与后台说明，交给调用方决定展示文案。 */
export class SkillStoreRequestError extends Error {
  readonly status: number
  constructor(status: number, message?: string) {
    super(message ?? '')
    this.name = 'SkillStoreRequestError'
    this.status = status
  }
}

/**
 * 组装同源请求头：携带工作台令牌与激活租户。
 * @param json - 是否声明 JSON 请求体。
 * @returns 请求头。
 */
function headers(json: boolean): Record<string, string> {
  return {
    authorization: `Bearer ${localStorage.getItem('workbench-client-token') ?? ''}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
    accept: 'application/json',
    ...(json ? { 'content-type': 'application/json' } : {}),
  }
}

/**
 * 读取失败响应中的后台说明，避免只暴露状态码。
 * @param response - 失败响应。
 * @returns 可展示的说明；没有说明时返回 undefined。
 */
async function failureMessage(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json().catch(() => undefined)
  if (typeof body !== 'object' || body === null) return undefined
  const error = (body as { error?: unknown }).error
  return typeof error === 'string' && error.trim() !== '' ? error.trim() : undefined
}

/**
 * 发起请求并在非 2xx 时抛出带说明的异常。
 * @param path - 相对技能包前缀的路径。
 * @param init - fetch 配置。
 * @returns 成功响应。
 */
async function request(path: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, init)
  } catch (_networkError) {
    // 网络中断没有可展示的后台说明，由界面回落到本地化提示。
    throw new SkillStoreRequestError(0)
  }
  if (!response.ok) throw new SkillStoreRequestError(response.status, await failureMessage(response))
  return response
}

/**
 * 判断后台返回的条目是否是可用的技能包摘要。
 * @param value - 单个数组元素。
 * @returns 是否为技能包摘要。
 */
function isSkillPackage(value: unknown): value is SkillPackageEntry {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && typeof record.name === 'string'
}

/**
 * 读取技能包清单。
 * @returns 技能包列表；后台返回空或格式不符时返回空数组。
 */
export async function fetchSkillPackages(): Promise<readonly SkillPackageEntry[]> {
  const response = await request('', { headers: headers(false) })
  const body: unknown = await response.json().catch(() => undefined)
  const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined
  return Array.isArray(data) ? data.filter(isSkillPackage) : []
}

/**
 * 下载技能包并触发浏览器保存。
 * @param id - 技能标识。
 * @param name - 技能名称，用于生成文件名。
 */
export async function downloadSkillPackage(id: string, name: string): Promise<void> {
  const query = name === '' ? '' : `?name=${encodeURIComponent(name)}`
  const response = await request(`/${encodeURIComponent(id)}/download${query}`, { headers: headers(false) })
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name === '' ? `skill-${id}.zip` : `${name}.zip`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * 把技能包安装到本机技能目录。
 * @param id - 技能标识。
 * @returns 安装后的技能名称。
 */
export async function installSkillPackage(id: string): Promise<string> {
  const response = await request(`/${encodeURIComponent(id)}/install`, {
    method: 'POST',
    headers: headers(false),
  })
  const body: unknown = await response.json().catch(() => undefined)
  const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined
  const name = typeof data === 'object' && data !== null ? (data as { name?: unknown }).name : undefined
  return typeof name === 'string' ? name : ''
}

/**
 * 从上传结果中读取技能名称。
 * @param body - 后台响应体。
 * @returns 技能名称；无法解析时返回空串。
 */
function uploadedName(body: unknown): string {
  const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined
  if (typeof data !== 'object' || data === null) return ''
  const record = data as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name : record.display_name
  return typeof name === 'string' ? name : ''
}

/**
 * 上传技能包到元枢后台，其他人即可在清单中下载。
 * @param file - 浏览器选择的 zip 文件。
 * @returns 后台返回的技能名称；无法解析时返回空串。
 */
export async function uploadSkillPackageFile(file: File): Promise<string> {
  const response = await request('/upload', {
    method: 'POST',
    headers: {
      ...headers(false),
      'content-type': file.type === '' ? 'application/zip' : file.type,
      'x-skill-file-name': encodeURIComponent(file.name),
    },
    body: file,
  })
  return uploadedName(await response.json().catch(() => undefined))
}

/**
 * 删除元枢平台上的技能包。
 * @param id - 技能标识。
 */
export async function deleteSkillPackage(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers(false) })
}

/**
 * 把本机已安装的技能直接打包上传，供其他员工下载。
 * @param name - 技能目录名。
 * @returns 后台返回的技能名称；无法解析时返回空串。
 */
export async function uploadLocalSkill(name: string): Promise<string> {
  const response = await request('/local/upload', {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ name }),
  })
  return uploadedName(await response.json().catch(() => undefined))
}
