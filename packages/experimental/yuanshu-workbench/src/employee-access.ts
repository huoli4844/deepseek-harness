/** 读取云端确认的员工角色与有效权限，按登录凭证和租户在宿主内短期复用。 */
import { createHash } from 'node:crypto'
import { field } from './business-forms/model.ts'
import { loadEmployeeProfile, YuanShuIdentityUnavailable } from './employee.ts'

interface EmployeeRole {
  readonly id: number
  readonly name: string
  readonly code: string
}

/** 空权限列表由后台明确返回，null 表示未提供或无法验证。 */
interface EmployeeAccess {
  readonly userId: number
  readonly tenantId: string
  readonly roles: readonly EmployeeRole[] | null
  readonly permissions: readonly string[] | null
}

interface Entry {
  readonly access: Promise<EmployeeAccess>
  expires: number | null
}

function parseRoles(value: unknown): readonly EmployeeRole[] | null {
  if (!Array.isArray(value) || value.length > 256) return null
  const roles: EmployeeRole[] = []
  for (const item of value) {
    const id = field(item, 'id'), name = field(item, 'name'), code = field(item, 'code')
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 ||
        typeof name !== 'string' || name.length > 256 || typeof code !== 'string' || code.length > 256) return null
    roles.push({ id, name, code })
  }
  return roles
}

function parsePermissions(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > 4096) return null
  const codes = new Set<string>()
  for (const code of value) {
    if (typeof code !== 'string' || code.length > 256 || !code.trim()) return null
    codes.add(code)
  }
  return [...codes]
}

/** 同一登录的初始化和会话查询可共用一次读取。记录仅保留在宿主内存。 */
export class EmployeeAccessStore {
  private readonly entries = new Map<string, Entry>()
  private readonly lifetime = new AbortController()

  constructor(private readonly api: string) {}

  /** 读取有效权限，租户不一致时拒绝，过期后以云端新结果为准。 */
  read(authorization: string, tenant: string): Promise<EmployeeAccess> {
    this.lifetime.signal.throwIfAborted()
    const key = createHash('sha256').update(authorization).update('\0').update(tenant).digest('hex')
    const now = Date.now()
    const existing = this.entries.get(key)
    if (existing && (existing.expires === null || existing.expires > now)) return existing.access
    for (const [id, entry] of this.entries) {
      if (entry.expires !== null && entry.expires <= now) this.entries.delete(id)
    }
    if (this.entries.size >= 64) throw new YuanShuIdentityUnavailable()
    const entry: Entry = { access: this.load(authorization, tenant), expires: null }
    this.entries.set(key, entry)
    void entry.access.then(
      () => { entry.expires = Date.now() + 60_000 },
      () => { this.entries.delete(key) },
    )
    return entry.access
  }

  private async load(authorization: string, tenant: string): Promise<EmployeeAccess> {
    const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(10_000)])
    const { employee, profile } = await loadEmployeeProfile(this.api, {
      authorization, 'X-Active-Tenant': tenant,
    }, signal)
    if (employee.tenantId !== tenant && employee.tenantCode !== tenant) throw new YuanShuIdentityUnavailable(403)
    return {
      userId: employee.userId,
      tenantId: employee.tenantId,
      roles: parseRoles(field(profile, 'roles')),
      permissions: parsePermissions(field(profile, 'permissions')),
    }
  }

  /** 工作台插件卸载时取消读取并清空缓存。 */
  dispose(): void {
    this.lifetime.abort()
    this.entries.clear()
  }
}
