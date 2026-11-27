/** 合同列表同源只读适配。后台按当前凭证授权项目及合同，失败时不返回部分数据。 */
import { ContractCatalogError, loadContractCatalog } from './contract-catalog.ts'
import { contractListPage, contractListQuery } from './contract-list.ts'

/** 汇总云端项目合同并投影为工作台分页，不暴露凭据。 */
export async function proxyContractList(req: { readonly url?: string | undefined; readonly method?: string | undefined },
  res: { writeHead(status: number, headers: Record<string, string>): unknown; end(body?: string): unknown },
  api: string, headers: Readonly<Record<string, string>>, signal: AbortSignal): Promise<void> {
  const send = (status: number, payload: object) => {
    res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(payload))
  }
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' })
    res.end()
    return
  }
  const query = contractListQuery(new URL(req.url ?? '/', 'http://localhost').searchParams)
  if (!query) { send(400, { error: 'Invalid contract query' }); return }
  try {
    const rows = await loadContractCatalog(api, headers, signal)
    send(200, { code: 200, data: contractListPage(rows, query) })
  } catch (error) {
    if (!(error instanceof ContractCatalogError)) throw error
    send(error.status, { error: 'YuanShu contract catalog unavailable' })
  }
}
