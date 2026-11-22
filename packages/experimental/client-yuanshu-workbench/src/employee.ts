/** Read the authenticated YuanShu employee and active tenant. */
import type { Employee } from './platform-home.ts'

/** YuanShu rejected the signed-in browser session. */
export class YuanShuSessionExpired extends Error {}

/** YuanShu could not resolve the authenticated employee identity. */
export class YuanShuIdentityUnavailable extends Error {}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return (value as Record<string, unknown>)[key]
}

function employeeFromResponses(userBody: unknown, tenantBody: unknown): Employee | undefined {
  const userId = field(field(userBody, 'data'), 'id')
  const tenantId = field(field(field(tenantBody, 'data'), 'current'), 'id')
  if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId <= 0 ||
      typeof tenantId !== 'number' || !Number.isSafeInteger(tenantId) || tenantId <= 0) return undefined
  return { userId, tenantId: String(tenantId) }
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
  const [user, tenants] = await Promise.all([
    fetch(`${api}/api/v1/user/me`, { headers, signal, redirect: 'error' }),
    fetch(`${api}/api/v1/user/tenants`, { headers, signal, redirect: 'error' }),
  ])
  if (user.status === 401 || tenants.status === 401) throw new YuanShuSessionExpired()
  if (!user.ok || !tenants.ok) throw new YuanShuIdentityUnavailable()
  const bodies: [unknown, unknown] = await Promise.all([user.json(), tenants.json()])
  const employee = employeeFromResponses(...bodies)
  if (employee === undefined) throw new YuanShuIdentityUnavailable()
  return employee
}
