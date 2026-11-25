/** 解析本周完成事项、下周计划与风险条目：后台把结构化数组存为 JSON 文本，旧数据回退为单条纯文本。 */

/** 本周完成工作的一行。 */
export interface CompletedRow {
  readonly project_code: string
  readonly project_name: string
  readonly task_id: number | undefined
  readonly task_name: string
  readonly completion_status: string
  readonly description: string
}

/** 下周工作计划的一行。 */
export interface PlanRow {
  readonly project_code: string
  readonly project_name: string
  readonly task_id: number | undefined
  readonly task_name: string
  readonly priority: 'high' | 'mid' | 'low'
  readonly description: string
}

/** 风险与阻塞的一行。 */
export interface RiskRow {
  readonly description: string
  readonly impact: string
  readonly support: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPriority(value: unknown): 'high' | 'mid' | 'low' {
  return value === 'high' || value === 'low' ? value : 'mid'
}

/** 兼容旧版计划行（project/stage 纯文本）与新版（project_code/task_id）两种结构。 */
function toPlanRow(value: unknown): PlanRow | undefined {
  if (!isRecord(value) || typeof value.description !== 'string') return undefined
  if (typeof value.project_code === 'string') {
    return {
      project_code: value.project_code,
      project_name: typeof value.project_name === 'string' ? value.project_name : '',
      task_id: typeof value.task_id === 'number' ? value.task_id : undefined,
      task_name: typeof value.task_name === 'string' ? value.task_name : '',
      priority: readPriority(value.priority),
      description: value.description,
    }
  }
  return {
    project_code: '',
    project_name: typeof value.project === 'string' ? value.project : '',
    task_id: undefined,
    task_name: typeof value.stage === 'string' ? value.stage : '',
    priority: readPriority(value.priority),
    description: value.description,
  }
}

function isCompletedRow(value: unknown): value is CompletedRow {
  return isRecord(value) && typeof value.project_code === 'string' && typeof value.project_name === 'string'
    && typeof value.task_name === 'string' && typeof value.completion_status === 'string'
    && typeof value.description === 'string'
}

function isRiskRow(value: unknown): value is RiskRow {
  return isRecord(value) && typeof value.description === 'string'
    && typeof value.impact === 'string' && typeof value.support === 'string'
}

/** 新建一条空白完成事项。 */
export function newCompletedRow(): CompletedRow {
  return { project_code: '', project_name: '', task_id: undefined, task_name: '', completion_status: '', description: '' }
}

/** 新建一条空白下周计划。 */
export function newPlanRow(): PlanRow {
  return { project_code: '', project_name: '', task_id: undefined, task_name: '', priority: 'mid', description: '' }
}

/** 读取完成事项行；无法解析时把整段文本视为一条事项描述。 */
export function parseCompletedRows(value: string): readonly CompletedRow[] {
  const single = (text: string): readonly CompletedRow[] => text.trim()
    ? [{ ...newCompletedRow(), description: text }]
    : []
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every(isCompletedRow)) return parsed.filter(isCompletedRow)
    return single(value)
  } catch { return single(value) }
}

/** 读取下周计划行；无法解析时把整段文本视为一条计划。 */
export function parsePlanRows(value: string): readonly PlanRow[] {
  const single = (text: string): readonly PlanRow[] => text.trim()
    ? [{ ...newPlanRow(), description: text }]
    : []
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) {
      const rows = parsed.map(toPlanRow).filter((row): row is PlanRow => row !== undefined)
      if (rows.length > 0) return rows
    }
    return single(value)
  } catch { return single(value) }
}

/** 读取风险行；无法解析时把整段文本视为一条风险描述。 */
export function parseRiskRows(value: string): readonly RiskRow[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every(isRiskRow)) return parsed.filter(isRiskRow)
  } catch { return value.trim() ? [{ description: value, impact: '', support: '' }] : [] }
  return value.trim() ? [{ description: value, impact: '', support: '' }] : []
}
