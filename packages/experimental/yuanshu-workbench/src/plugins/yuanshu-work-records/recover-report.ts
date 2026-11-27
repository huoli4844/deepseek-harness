/** 报表恢复复用业务访问层，只接受已校验的本人身份。 */
import type { ReportRecovery } from '../../business-forms/recovery.ts'
import { ReportRequestError, type Credential, type WorkRecords } from './index.ts'

/** 重新确认失败请求。日报沿用幂等键，周报核对已知草稿版本和正文。 */
export async function recoverReport(records: WorkRecords, credential: Credential,
  input: ReportRecovery, signal: AbortSignal): Promise<unknown> {
  const identity = await records.identity(credential, signal)
  if (!identity.canWrite || input.account !== `${identity.tenant}:${identity.user}`) throw new ReportRequestError(403)
  const status = input.action === 'submit' ? 'submitted' : 'draft'
  if (input.kind === 'daily') return records.save(input.date, credential, {
    content: input.content, evidence: input.evidence, version: input.version, request: input.request_id, status,
  }, signal)
  return records.saveWeekly(input.date, credential, { content: input.content, status, recoveryRevision: input.baseRevision,
    ...(input.previousContent ? { previousContent: input.previousContent } : {}) }, signal)
}
