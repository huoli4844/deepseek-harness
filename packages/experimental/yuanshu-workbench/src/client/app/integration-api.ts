/** 数据同步弹窗的数据层：同源读取后台接入状态并触发单项测试。 */

const STATUS_PATH = '/yuanshu-workbench/integration-status'
const TEST_PATH = '/yuanshu-workbench/integration-status/test'

/** 需要独立测试的接入项。 */
export type IntegrationTarget = 'knowledge' | 'api'

/** 宿主返回的接入状态快照。 */
export interface IntegrationSnapshot {
  readonly knowledge: {
    readonly connected: boolean
    readonly state: string
    readonly tools: number | null
    readonly checkedAt: string | null
    readonly errorCode: string | null
    readonly error: string | null
  }
  readonly api: {
    readonly connected: boolean
    readonly paths: number | null
    readonly operations: number | null
    readonly checkedAt: string | null
    readonly errorCode: string | null
    readonly error: string | null
  }
  readonly message: { readonly connected: boolean }
}

function headers(json: boolean): Record<string, string> {
  return {
    authorization: `Bearer ${localStorage.getItem('workbench-client-token') ?? ''}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
    accept: 'application/json',
    ...(json ? { 'content-type': 'application/json' } : {}),
  }
}

async function readSnapshot(response: Response): Promise<IntegrationSnapshot> {
  if (!response.ok) throw new Error(`integration ${String(response.status)}`)
  return await response.json() as IntegrationSnapshot
}

/** 读取当前接入状态；超过五分钟由宿主自动重新检测。 */
export async function fetchIntegrationStatus(): Promise<IntegrationSnapshot> {
  return readSnapshot(await fetch(STATUS_PATH, { headers: headers(false) }))
}

/** 触发一项接入测试：knowledge 刷新 MCP 目录，api 重新拉取 Swagger 文档。 */
export async function testIntegration(target: IntegrationTarget): Promise<IntegrationSnapshot> {
  return readSnapshot(await fetch(TEST_PATH, {
    method: 'POST', headers: headers(true), body: JSON.stringify({ target }),
  }))
}
