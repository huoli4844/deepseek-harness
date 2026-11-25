/** 通过工作台同源代理读取元枢知识库集合、文档与原文预览，不依赖 React。 */
import type {
  DoclibCollection, DoclibDocument, DoclibDocumentPage, DoclibQuery, DoclibRequestError,
  StorageConfig, StorageDraft, StorageHealth,
} from './model.ts'

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return Reflect.get(value, key) as unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function parseCollection(value: unknown): DoclibCollection {
  return {
    id: text(field(value, 'id')),
    code: text(field(value, 'code')),
    name: text(field(value, 'name')),
    description: text(field(value, 'description')),
  }
}

function parseDocument(value: unknown): DoclibDocument {
  const tags = field(value, 'tags_json')
  return {
    id: text(field(value, 'id')),
    title: text(field(value, 'title')),
    originalName: text(field(value, 'original_name')),
    directoryPath: text(field(value, 'directory_path')),
    mimeType: text(field(value, 'mime_type')),
    sensitivity: text(field(value, 'sensitivity')),
    parseStatus: text(field(value, 'parse_status')),
    tags: typeof tags === 'string' && tags !== ''
      ? tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '')
      : [],
    createdAt: text(field(value, 'created_at')),
    updatedAt: text(field(value, 'updated_at')),
    fileId: text(field(value, 'file_id')),
  }
}

function parsePage(value: unknown): DoclibDocumentPage {
  const list = field(value, 'list')
  if (!Array.isArray(list)) throw new Error('Invalid YuanShu document page')
  return {
    list: list.map(parseDocument),
    page: integer(field(value, 'page')) ?? 1,
    pageSize: integer(field(value, 'page_size')) ?? 20,
    total: integer(field(value, 'total')) ?? 0,
  }
}

/** 统一请求：同源代理路径 + 员工 token + 活跃租户；401 映射为登录类别。 */
async function request(path: string, signal: AbortSignal, accept = 'application/json'): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { status: 401, kind: 'missingToken' })
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
    accept,
  })
  const response = await fetch(`/yuanshu-doclib/${path}`, { headers, signal })
  if (!response.ok) {
    throw Object.assign(new Error('YuanShu doclib request failed'), {
      status: response.status,
      kind: response.status === 401 ? 'login' : 'failed',
    })
  }
  return field(await response.json(), 'data')
}

/** 请求错误类别：401 映射为登录提示，其余归为加载失败。 */
export function requestErrorKind(error: unknown): DoclibRequestError {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'kind') === 'login' ? 'login' : 'failed'
}

/** 读取知识库集合列表。 */
export async function fetchCollections(signal: AbortSignal): Promise<readonly DoclibCollection[]> {
  const data = await request('collections', signal)
  const list = field(data, 'list')
  if (!Array.isArray(list)) throw new Error('Invalid YuanShu collection list')
  return list.map(parseCollection)
}

/** 按集合与关键字分页读取文档列表。 */
export async function fetchDocuments(query: DoclibQuery, signal: AbortSignal): Promise<DoclibDocumentPage> {
  const params = new URLSearchParams({
    collection_id: query.collectionId,
    page: String(query.page),
    page_size: String(query.pageSize),
  })
  if (query.keyword !== '') params.set('keyword', query.keyword)
  return parsePage(await request(`documents?${params.toString()}`, signal))
}

/** 读取文档详情。 */
export async function fetchDocumentDetail(id: string, signal: AbortSignal): Promise<DoclibDocument> {
  const data = await request(`documents/${encodeURIComponent(id)}`, signal)
  return parseDocument(field(data, 'document'))
}

/** 目录索引每页条数与最多读取页数：用于从前端聚合文件夹树，覆盖千份以内的集合。 */
const INDEX_PAGE_SIZE = 200
const INDEX_MAX_PAGES = 5

/** 逐页读取集合文档，供前端按 directory_path 聚合目录树。 */
export async function fetchDocumentIndex(
  collectionId: string,
  signal: AbortSignal,
): Promise<readonly DoclibDocument[]> {
  const collected: DoclibDocument[] = []
  for (let page = 1; page <= INDEX_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      collection_id: collectionId,
      page: String(page),
      page_size: String(INDEX_PAGE_SIZE),
    })
    const result = parsePage(await request(`documents?${params.toString()}`, signal))
    collected.push(...result.list)
    if (collected.length >= result.total || result.list.length === 0) break
  }
  return collected
}

/** 读取 NAS（外部存储）当前配置。 */
export async function fetchStorageConfig(signal: AbortSignal): Promise<StorageConfig> {
  const data = await request('storage/config', signal)
  return {
    endpoint: text(field(data, 'endpoint')),
    bucket: text(field(data, 'bucket')),
    region: text(field(data, 'region')),
    useSsl: field(data, 'use_ssl') === true,
    configured: field(data, 'configured') === true,
    credentialsConfigured: field(data, 'credentials_configured') === true,
    credentialSource: text(field(data, 'credential_source')),
  }
}

/** 读取 NAS（外部存储）健康检查结果。 */
export async function fetchStorageHealth(signal: AbortSignal): Promise<StorageHealth> {
  const data = await request('storage/health', signal)
  return {
    healthy: field(data, 'healthy') === true,
    readable: field(data, 'readable') === true,
    writable: field(data, 'writable') === true,
    message: text(field(data, 'message')),
    latencyMs: integer(field(data, 'latency_ms')) ?? 0,
  }
}

/** 保存 NAS 配置；凭证留空时不提交，沿用服务端现有凭证。 */
export async function saveStorageConfig(draft: StorageDraft, signal: AbortSignal): Promise<void> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { status: 401, kind: 'missingToken' })
  const body: Record<string, unknown> = {
    endpoint: draft.endpoint.trim(),
    bucket: draft.bucket.trim(),
    region: draft.region.trim(),
    use_ssl: draft.useSsl,
  }
  if (draft.accessKey.trim() !== '' && draft.secretKey.trim() !== '') {
    body.access_key = draft.accessKey.trim()
    body.secret_key = draft.secretKey.trim()
  }
  const response = await fetch('/yuanshu-doclib/storage/config', {
    method: 'PUT',
    headers: new Headers({
      authorization: `Bearer ${token}`,
      'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
      'content-type': 'application/json',
      accept: 'application/json',
    }),
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    throw Object.assign(new Error('YuanShu storage config failed'), {
      status: response.status,
      kind: response.status === 401 ? 'login' : 'failed',
    })
  }
}

/** 读取文档原文预览字节流，供详情弹窗构造本地预览地址。 */
export async function fetchPreviewBlob(fileId: string, signal: AbortSignal): Promise<Blob> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { status: 401, kind: 'missingToken' })
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
    accept: '*/*',
  })
  const response = await fetch(`/yuanshu-doclib/files/${encodeURIComponent(fileId)}/preview`, { headers, signal })
  if (!response.ok) {
    throw Object.assign(new Error('YuanShu preview request failed'), {
      status: response.status,
      kind: response.status === 401 ? 'login' : 'failed',
    })
  }
  return response.blob()
}
