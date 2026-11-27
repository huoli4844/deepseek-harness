/** 读取当前员工可访问的项目及合同。仅使用云端已发布的查询接口，不访问数据库。 */

/** 汇总查询失败，保留后台鉴权状态供页面显示。 */
export class ContractCatalogError extends Error {
  constructor(readonly status: number) {
    super('YuanShu contract catalog unavailable')
  }
}

/** 校验后的合同与项目数据行。 */
export interface ContractCatalogRow {
  readonly [key: string]: unknown
}

function object(value: unknown): value is ContractCatalogRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function array(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function unpack(body: unknown) {
  const code = object(body) ? body.code : undefined
  if (code !== undefined && ![0, 200, 201, '0', '200', '201'].some(success => success === code)) {
    throw new ContractCatalogError(code === 401 || code === '401' ? 401 : code === 403 || code === '403' ? 403 : 502)
  }
  const data = object(body) ? body.data ?? body : body
  const rows = array(data) ? data : object(data) ? data.items ?? data.list ?? data.rows ?? data.records : undefined
  if (!array(rows) || !rows.every(object)) throw new ContractCatalogError(502)
  const total = object(data) ? data.total : undefined
  if (total !== undefined && (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0)) {
    throw new ContractCatalogError(502)
  }
  return { rows, total: typeof total === 'number' ? total : undefined }
}

/** 读取完整可见合同，超出分页保护上限时报错，避免将部分数据当成全量。 */
export async function loadContractCatalog(api: string, headers: Readonly<Record<string, string>>,
  signal: AbortSignal, request: typeof fetch = fetch): Promise<readonly ContractCatalogRow[]> {
  async function all(path: string) {
    const result: ContractCatalogRow[] = []
    for (let page = 1; page <= 100; page++) {
      const url = new URL(path, api)
      url.searchParams.set('page', String(page))
      url.searchParams.set('page_size', '200')
      const response = await request(url, { headers, signal, redirect: 'error' })
      if (!response.ok) throw new ContractCatalogError(response.status)
      const { rows, total } = unpack(await response.json())
      result.push(...rows)
      if (total !== undefined && result.length >= total) return result
      if (total === undefined && rows.length < 200) return result
      if (!rows.length) throw new ContractCatalogError(502)
    }
    throw new ContractCatalogError(502)
  }

  const projects = await all('/api/v1/apps/shaoshi/projects')
  const seenProjects = new Set<string>()
  const rows: ContractCatalogRow[] = []
  // 顺序请求避免大租户同时向后台发起大量项目查询。
  for (const project of projects) {
    const code = project.code
    if (typeof code !== 'string' || !code.trim()) throw new ContractCatalogError(502)
    if (seenProjects.has(code)) continue
    seenProjects.add(code)
    const contracts = await all(`/api/v1/apps/shaoshi/projects/${encodeURIComponent(code)}/contracts`)
    for (const contract of contracts) {
      if (typeof contract.id !== 'number' || !Number.isSafeInteger(contract.id) || contract.id <= 0) {
        throw new ContractCatalogError(502)
      }
      rows.push({ ...contract, project_code: code, project_name: contract.project_name ?? project.name })
    }
  }
  return rows
}
