/** 把回执失败码映射为待办状态，不显示接口诊断。 */
import { field } from '../../../business-forms/model.ts'
import type { ReportTask } from './recovery-store.ts'

/** 明确失败允许编辑，结果未知需要原样核验。 */
export function recoveryResult(error: unknown): ReportTask['result'] {
  const status = field(error, 'status')
  if (typeof status !== 'number' || status >= 500) return 'uncertain'
  if (status === 401 || status === 403) return 'auth'
  if (status === 409) return 'conflict'
  if (status === 404) return 'expired'
  return 'invalid'
}
