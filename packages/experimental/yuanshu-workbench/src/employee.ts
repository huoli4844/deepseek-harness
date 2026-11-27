/** Read the authenticated YuanShu employee and active tenant. */
import type { Employee } from './platform-home.ts'

/** YuanShu rejected the signed-in browser session. */
export class YuanShuSessionExpired extends Error {}

/** YuanShu could not resolve the authenticated employee identity. */
export class YuanShuIdentityUnavailable extends Error {
  /** The HTTP status YuanShu's backend actually returned, when any. */
  readonly upstream: number | undefined

  constructor(upstream?: number) {
    super()
    this.upstream = upstream
  }
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return (value as Record<string, unknown>)[key]
}

function employeeFromResponses(userBody: unknown, tenantBody: unknown): Employee | undefined {
  if ([userBody, tenantBody].some((body) => {
    const code = field(body, 'code')
    return code !== undefined && code !== 0 && code !== 200
  })) return undefined
  const userId = field(field(userBody, 'data'), 'id')
  const current = field(field(tenantBody, 'data'), 'current')
  const tenantId = field(current, 'id')
  const tenantCode = field(current, 'code')
  if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId <= 0 ||
      typeof tenantId !== 'number' || !Number.isSafeInteger(tenantId) || tenantId <= 0 ||
      typeof tenantCode !== 'string' || tenantCode === '') return undefined
  return { userId, tenantId: String(tenantId), tenantCode }
}

/**
 * Resolve the browser employee and active tenant from YuanShu's authenticated responses.
 * @param api - YuanShu API base URL without a trailing slash.
 * @param headers - Authenticated browser headers.
 * @param signal - Request lifetime.
 * @returns The current employee and active tenant.
 * @throws {@link YuanShuSessionExpired} when YuanShu returns 401, or {@link YuanShuIdentityUnavailable} when identity data is unavailable.
 */
export async function loadEmployee(api: string, headers: Record<string, string>, signal: AbortSignal): Promise<Employee> {
  return (await loadEmployeeProfile(api, headers, signal)).employee
}

/** 读取同一凭证下的用户资料和云端确认的租户，供权限同步使用。 */
export async function loadEmployeeProfile(api: string, headers: Record<string, string>, signal: AbortSignal) {
  const [user, tenants] = await Promise.all([
    fetch(`${api}/api/v1/user/me`, { headers, signal, redirect: 'error' }),
    fetch(`${api}/api/v1/user/tenants`, { headers, signal, redirect: 'error' }),
  ])
  if (user.status === 401 || tenants.status === 401) throw new YuanShuSessionExpired()
  if (!user.ok || !tenants.ok) throw new YuanShuIdentityUnavailable(!user.ok ? user.status : tenants.status)
  const bodies: [unknown, unknown] = await Promise.all([user.json(), tenants.json()])
  const employee = employeeFromResponses(...bodies)
  if (employee === undefined) throw new YuanShuIdentityUnavailable()
  return { employee, profile: field(bodies[0], 'data') }
}
