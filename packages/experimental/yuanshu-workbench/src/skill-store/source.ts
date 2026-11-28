/** 元枢技能包数据源：读取技能清单、导出已发布技能包、导入新技能包。 */
import { randomUUID } from 'node:crypto'

/** 技能包在设置页展示的摘要字段。 */
export interface SkillPackageSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version?: string
  readonly status?: string
  readonly category?: string
  readonly updatedAt?: string
}

/** 访问元枢后台所需的请求上下文。 */
export interface SkillStoreAuth {
  /** 元枢后台地址，不含末尾斜杠。 */
  readonly api: string
  /** 当前员工的 Bearer 令牌。 */
  readonly authorization: string
  /** 当前租户标识。 */
  readonly tenant?: string | undefined
}

/** 技能包操作失败，status 直接作为前端 HTTP 状态码。 */
export class SkillStoreError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'SkillStoreError'
    this.status = status
  }
}

/** 技能包压缩包大小上限，与安装器一致。 */
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024

/** 依次尝试的导出地址：客户端接口优先，其后是管理端导出。 */
const DOWNLOAD_PATHS: readonly ((id: string) => string)[] = [
  id => `/api/v1/client/skills/${id}/package`,
  id => `/api/v1/skills/${id}/export-published-package`,
  id => `/api/v1/skills/${id}/export-package`,
]

/**
 * 组装转发头：始终携带员工令牌，有租户时补上激活租户。
 * @param auth - 元枢后台请求上下文。
 * @param accept - 期望的响应类型。
 * @returns 可直接交给 fetch 的请求头。
 */
function requestHeaders(auth: SkillStoreAuth, accept: string): Record<string, string> {
  const headers: Record<string, string> = { authorization: auth.authorization, accept }
  if (auth.tenant !== undefined && auth.tenant !== '') headers['X-Active-Tenant'] = auth.tenant
  return headers
}

/**
 * 读取后台失败响应中的可展示说明，避免只暴露状态码。
 * @param status - 后台 HTTP 状态码。
 * @param json - 后台响应体。
 * @returns 员工可读的错误文本。
 */
export function upstreamMessage(status: number, json: unknown): string {
  const detail = typeof json === 'object' && json !== null
    ? (json as { message?: unknown; error?: unknown }).message ?? (json as { error?: unknown }).error
    : undefined
  if (typeof detail === 'string' && detail.trim() !== '' && detail.length <= 200
    && !/[<>\p{Cc}]|https?:\/\//iu.test(detail)) return detail.trim()
  return status === 401 ? '登录状态已失效，请重新登录后重试'
    : status === 403 ? '当前账号没有技能包管理权限'
      : status === 404 ? '没有找到对应的技能包'
        : status === 413 ? '技能包超过大小上限'
          : `技能包请求失败（HTTP ${status}）`
}

/**
 * 拆开后台运行时响应外壳：优先取 data 字段，失败标记转成异常。
 * @param json - 后台响应体。
 * @param status - 后台 HTTP 状态码。
 * @returns 业务数据。
 */
function unwrapData(json: unknown, status: number): unknown {
  if (typeof json !== 'object' || json === null) return json
  const record = json as Record<string, unknown>
  if (record.success === false || (typeof record.code === 'number' && record.code >= 400)) {
    throw new SkillStoreError(status >= 400 ? status : 502, upstreamMessage(status, json))
  }
  return 'data' in record ? record.data : record
}

/**
 * 从对象中按候选键取字符串。
 * @param record - 单条技能数据。
 * @param keys - 候选字段名，按优先级排列。
 * @returns 第一个非空字符串；都没有时返回 undefined。
 */
function pickString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

/**
 * 把后台技能清单规整为统一摘要；兼容 data/items/list 等常见外壳。
 * @param json - 后台响应体。
 * @returns 技能包摘要列表，按名称排序。
 */
export function normalizeSkillList(json: unknown): SkillPackageSummary[] {
  const root = unwrapData(json, 200)
  const rows = Array.isArray(root) ? root
    : typeof root === 'object' && root !== null
      ? ['items', 'list', 'records', 'rows', 'skills'].map(key => (root as Record<string, unknown>)[key]).find(Array.isArray) as unknown[] | undefined
      : undefined
  if (rows === undefined) return []
  const result: SkillPackageSummary[] = []
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const record = row as Record<string, unknown>
    const id = pickString(record, ['id', 'skill_id', 'skillId'])
    if (id === undefined) continue
    const name = pickString(record, ['name', 'display_name', 'displayName', 'skill_name', 'title']) ?? `skill-${id}`
    const version = pickString(record, ['version', 'latest_version', 'latestVersion', 'published_version'])
    const status = pickString(record, ['status', 'governance_state', 'state'])
    const category = pickString(record, ['category', 'artifact_kind', 'group'])
    const updatedAt = pickString(record, ['updated_at', 'updatedAt', 'published_at', 'publishedAt'])
    result.push({
      id,
      name,
      description: pickString(record, ['description', 'summary', 'intro']) ?? '',
      ...(version === undefined ? {} : { version }),
      ...(status === undefined ? {} : { status }),
      ...(category === undefined ? {} : { category }),
      ...(updatedAt === undefined ? {} : { updatedAt }),
    })
  }
  return result.sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * 读取技能包清单。
 * @param auth - 元枢后台请求上下文。
 * @returns 技能包摘要列表。
 */
export async function listSkillPackages(auth: SkillStoreAuth): Promise<SkillPackageSummary[]> {
  let response: Response
  try {
    response = await fetch(new URL('/api/v1/skills', auth.api), {
      headers: requestHeaders(auth, 'application/json'),
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    throw new SkillStoreError(502, error instanceof Error && error.name === 'TimeoutError' ? '读取技能包清单超时' : '无法连接元枢后台')
  }
  const json: unknown = await response.json().catch(() => undefined)
  if (!response.ok) throw new SkillStoreError(response.status, upstreamMessage(response.status, json))
  return normalizeSkillList(json)
}

/**
 * 判断字节是否是 zip 头，用于识别二进制导出。
 * @param bytes - 响应体字节。
 * @returns 是否为 zip 压缩包。
 */
function isZip(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && (bytes[2] === 0x03 || bytes[2] === 0x05)
}

/**
 * 尝试把字符串按 base64 解成 zip；解不出来时返回 undefined。
 * @param value - 可能是 base64 或 data URI 的字符串。
 * @returns 解出的字节；不是有效 zip 时返回 undefined。
 */
function decodeBase64Archive(value: string): Uint8Array | undefined {
  const payload = value.includes(',') && value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value
  const compact = payload.replace(/\s+/gu, '')
  if (compact.length < 16 || !/^[A-Za-z0-9+/_-]+={0,2}$/u.test(compact)) return undefined
  const bytes = new Uint8Array(Buffer.from(compact, 'base64'))
  return isZip(bytes) ? bytes : undefined
}

/**
 * 从 JSON 导出结果中提取压缩包：兼容 base64 字段与下载地址两种形态。
 * @param json - 后台 JSON 响应体。
 * @param auth - 元枢后台请求上下文，用于跟随下载地址。
 * @returns 压缩包字节；无法识别时返回 undefined。
 */
async function archiveFromJson(json: unknown, auth: SkillStoreAuth): Promise<Uint8Array | undefined> {
  let data: unknown
  try {
    data = unwrapData(json, 200)
  } catch (_failedEnvelope) {
    return undefined
  }
  const direct = typeof data === 'string' ? decodeBase64Archive(data) : undefined
  if (direct !== undefined) return direct
  if (typeof data !== 'object' || data === null) return undefined
  const record = data as Record<string, unknown>
  for (const key of ['content_base64', 'contentBase64', 'base64', 'content', 'archive', 'package', 'file']) {
    const value = record[key]
    if (typeof value !== 'string') continue
    const bytes = decodeBase64Archive(value)
    if (bytes !== undefined) return bytes
  }
  for (const key of ['download_url', 'downloadUrl', 'package_url', 'packageUrl', 'file_url', 'fileUrl', 'url']) {
    const value = record[key]
    if (typeof value !== 'string' || !/^https?:\/\//u.test(value)) continue
    try {
      const response = await fetch(value, { headers: requestHeaders(auth, 'application/zip, application/octet-stream'), redirect: 'follow', signal: AbortSignal.timeout(60_000) })
      if (!response.ok) continue
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (isZip(bytes)) return bytes
    } catch (_failedDownload) {
      // 换下一个候选地址继续尝试。
    }
  }
  return undefined
}

/**
 * 把单个导出响应转成压缩包字节。
 * @param response - 后台导出响应。
 * @param auth - 元枢后台请求上下文。
 * @returns 压缩包字节；响应不是可识别包时返回 undefined。
 */
async function archiveFromResponse(response: Response, auth: SkillStoreAuth): Promise<Uint8Array | undefined> {
  const type = response.headers.get('content-type') ?? ''
  if (type.includes('json')) {
    const json: unknown = await response.json().catch(() => undefined)
    return archiveFromJson(json, auth)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (isZip(bytes)) return bytes
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return await archiveFromJson(json, auth)
  } catch (_notJson) {
    return undefined
  }
}

/**
 * 下载技能包；依次尝试客户端导出、已发布包导出与草稿包导出。
 * @param auth - 元枢后台请求上下文。
 * @param id - 技能标识。
 * @returns 压缩包字节。
 */
export async function fetchSkillArchive(auth: SkillStoreAuth, id: string): Promise<Uint8Array> {
  let lastStatus = 404
  for (const path of DOWNLOAD_PATHS) {
    let response: Response
    try {
      response = await fetch(new URL(path(id), auth.api), {
        headers: requestHeaders(auth, 'application/zip, application/octet-stream, application/json'),
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      })
    } catch (error) {
      lastStatus = 502
      if (error instanceof Error && error.name === 'TimeoutError') break
      continue
    }
    if (!response.ok) {
      lastStatus = response.status
      continue
    }
    const bytes = await archiveFromResponse(response, auth)
    if (bytes === undefined) {
      lastStatus = 502
      continue
    }
    if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new SkillStoreError(413, '技能包超过 20MB，无法下载')
    return bytes
  }
  throw new SkillStoreError(lastStatus >= 400 && lastStatus < 500 ? lastStatus : 502,
    lastStatus === 404 ? '该技能没有可下载的已发布包' : upstreamMessage(lastStatus, undefined))
}

/**
 * 删除元枢平台上的技能包。
 * @param auth - 元枢后台请求上下文。
 * @param id - 技能标识。
 */
export async function deleteSkillPackage(auth: SkillStoreAuth, id: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(new URL(`/api/v1/skills/${id}`, auth.api), {
      method: 'DELETE',
      headers: requestHeaders(auth, 'application/json'),
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    throw new SkillStoreError(502, error instanceof Error && error.name === 'TimeoutError' ? '删除技能包超时' : '无法连接元枢后台')
  }
  if (!response.ok) {
    const json: unknown = await response.json().catch(() => undefined)
    throw new SkillStoreError(response.status, upstreamMessage(response.status, json))
  }
}

/**
 * 清洗上传文件名，避免把路径或非法字符带到后台。
 * @param name - 浏览器提供的文件名。
 * @returns 安全的 zip 文件名。
 */
function safeArchiveName(name: string): string {
  const base = name.split(/[\\/]/u).pop() ?? ''
  const cleaned = base.replace(/[^A-Za-z0-9._-]/gu, '').slice(0, 80)
  return cleaned.endsWith('.zip') ? cleaned : `${cleaned === '' ? 'skill-package' : cleaned}.zip`
}

/**
 * 上传技能包到元枢后台的导入接口。
 * @param auth - 元枢后台请求上下文。
 * @param fileName - 浏览器提供的文件名。
 * @param bytes - 压缩包字节。
 * @returns 后台返回的业务数据（通常是新技能记录）。
 */
export async function uploadSkillPackage(auth: SkillStoreAuth, fileName: string, bytes: Uint8Array): Promise<unknown> {
  if (bytes.byteLength === 0) throw new SkillStoreError(400, '技能包内容为空')
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new SkillStoreError(413, '技能包超过 20MB，无法上传')
  if (!isZip(bytes)) throw new SkillStoreError(400, '请上传 zip 格式的技能包')
  // 手工拼 multipart，避免依赖全局 Blob 实现，也便于在测试里断言请求体。
  const boundary = `----dsh${randomUUID()}`
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeArchiveName(fileName)}"\r\n`
    + 'Content-Type: application/zip\r\n\r\n',
    'utf8',
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  const body = Buffer.concat([head, Buffer.from(bytes), tail])
  const headers = requestHeaders(auth, 'application/json')
  headers['content-type'] = `multipart/form-data; boundary=${boundary}`
  let response: Response
  try {
    response = await fetch(new URL('/api/v1/skills/import-package', auth.api), {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    })
  } catch (error) {
    throw new SkillStoreError(502, error instanceof Error && error.name === 'TimeoutError' ? '上传技能包超时' : '无法连接元枢后台')
  }
  const json: unknown = await response.json().catch(() => undefined)
  if (!response.ok) throw new SkillStoreError(response.status, upstreamMessage(response.status, json))
  return unwrapData(json, response.status)
}
