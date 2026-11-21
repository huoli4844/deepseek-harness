/** Read-only adapter for the employee workbench MCP projections. */

/** The current grant is scoped to a different employee or tenant. */
export class YuanShuGrantMismatch extends Error {}

interface Employee {
  readonly tenantId: string
  readonly userId: number
}

interface WorkItem {
  readonly kind: 'risk' | 'task'
  readonly id: number
  readonly title: string
}

interface PlatformHome {
  readonly name: string
  readonly employee: Employee
  readonly items: readonly WorkItem[]
  readonly rows: readonly { title: string; detail: string }[]
}

type ReadProjection = (tool: 'workbench_profile' | 'workbench_home' | 'workbench_briefing' | 'workbench_decisions' | 'workbench_position', signal: AbortSignal) => Promise<unknown>

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function projection(value: unknown): Record<string, unknown> {
  const result = record(value)
  const envelope = record(result?.structuredContent)
  const data = record(envelope?.data)
  if (result?.isError === true || envelope?.outcome !== 'returned' || data === undefined) {
    throw new Error('YuanShu workbench projection failed')
  }
  return data
}

function items(value: unknown, kind: WorkItem['kind'], titleKey: string): WorkItem[] {
  if (!Array.isArray(value)) throw new Error('YuanShu workbench list is missing')
  return value.map((value: unknown) => {
    const row = record(value)
    const id = row?.id
    const title = row?.[titleKey]
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || typeof title !== 'string' || title.trim() === '') {
      throw new Error('YuanShu workbench record is invalid')
    }
    const details = {
      code: row?.[kind === 'risk' ? 'risk_code' : 'code'],
      project: row?.project_name,
      owner: row?.[kind === 'risk' ? 'handler_name' : 'owner_name'],
      deadline: row?.[kind === 'risk' ? 'deadline' : 'plan_end'],
      status: row?.status,
    }
    return { kind, id, title, ...Object.fromEntries(Object.entries(details).filter(([, value]) => typeof value === 'string' && value !== '')) }
  })
}

/**
 * Load the current employee's authorized home projection after verifying the grant identity.
 * @param read - Host reader bound to one employee MCP credential.
 * @param employee - Employee identity obtained from the authenticated Host session.
 * @param signal - Request lifetime.
 * @param section - Selected live workbench section.
 * @returns Workbench name, verified employee identity, and authorized items or rows for the section.
 */
export async function loadPlatformHome(read: ReadProjection, employee: Employee, signal: AbortSignal, section = 'assistant'): Promise<PlatformHome> {
  signal.throwIfAborted()
  const profile = projection(await read('workbench_profile', signal))
  signal.throwIfAborted()
  if (profile.tenant_id !== employee.tenantId || profile.user_id !== employee.userId) {
    throw new YuanShuGrantMismatch('YuanShu MCP grant belongs to another employee')
  }
  const fields = (value: unknown, label: string): { title: string; detail: string }[] => {
    if (value == null) return []
    if (!Array.isArray(value)) throw new Error('Invalid YuanShu workbench list')
    return value.map((entry: unknown) => {
      const row = record(entry)
      const title = row?.[label]
      if (typeof title !== 'string') throw new Error('Invalid YuanShu workbench title')
      const detail = [row?.value, row?.reason, row?.project_name, row?.status, row?.plan_date, row?.intent, row?.deadline]
        .filter(value => typeof value === 'string' && value !== '' || typeof value === 'number').join(' · ')
      return { title, detail }
    })
  }
  const tool = section === 'dashboard' ? 'workbench_briefing'
    : section === 'priorities' ? 'workbench_decisions'
      : section === 'methods' || section === 'position-operations' ? 'workbench_position'
        : 'workbench_home'
  const home = projection(await read(tool, signal))
  const tenant = record(home.tenant)
  if (tenant !== undefined && tenant.id !== employee.tenantId) throw new YuanShuGrantMismatch('YuanShu projection belongs to another tenant')
  const name = record(home.workbench)?.name ?? home.title
  const rows = section === 'dashboard' ? fields(home.kpis, 'label')
    : section === 'priorities' ? fields(home.items, 'title')
      : section === 'methods' || section === 'position-operations' ? fields(home.workflows, 'label')
        : section === 'calendar' ? fields(home.milestones, 'name')
          : section === 'project-operations' ? fields(home.projects, 'name')
            : []
  const risks = section === 'assistant' ? items(home.risks, 'risk', 'title') : []
  const tasks = section === 'assistant' || section === 'tasks' ? items(home.my_tasks, 'task', 'name') : []
  return { name: typeof name === 'string' ? name : '', employee, items: [...risks, ...tasks], rows }
}
