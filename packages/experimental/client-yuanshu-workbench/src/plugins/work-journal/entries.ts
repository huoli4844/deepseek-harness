/** 将已提交的会话事件投影为最少字段的本地工作记录，不访问磁盘。 */
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { field, type WorkEvidence } from '../../business-forms/model.ts'

/** 归档记录的版本和可选的工作区内成果路径。 */
export interface JournalEntry extends WorkEvidence {
  readonly version: 1
  readonly paths?: readonly string[]
}

function workspacePath(cwd: string | undefined, value: unknown): string | undefined {
  if (cwd === undefined || !isAbsolute(cwd) || typeof value !== 'string' || value.length > 1024 || /[\r\n\0]/u.test(value)) return
  const path = relative(cwd, resolve(cwd, value))
  if (!path || isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) return
  return path.split(sep).join('/')
}

/** 按顺序配对工具调用及结果，并仅收录宿主确认过的成果路径。 */
export class JournalProjection {
  private readonly calls = new Map<string, string>()
  constructor(private readonly id: string, private readonly cwd: string | undefined) {}

  /** 完整消息、工具参数、原始返回和文件正文均不进入归档。 */
  event(event: SessionEvent): JournalEntry | undefined {
    const base = { version: 1 as const, session_id: this.id, seq: event.seq,
      time: new Date(event.time).toISOString(), truncated: false }
    if (event.type === 'tool/call') {
      this.calls.set(event.data.callId, event.data.name)
      if (this.calls.size > 256) {
        const first = this.calls.keys().next().value
        if (first !== undefined) this.calls.delete(first)
      }
      return
    }
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      return { ...base, kind: 'user/message', outcome: 'unverified', text: '用户发起工作事项；正文见原会话' }
    }
    if (event.type === 'tool/result') {
      const id = event.data.message.toolCallId
      const tool = this.calls.get(id)
      this.calls.delete(id)
      if (tool === undefined || !/^[\w.-]{1,128}$/u.test(tool)
        || tool === 'work_evidence_today' || tool.startsWith('work_records_')) return
      const failed = event.data.message.isError === true
      return { ...base, kind: 'tool/result', tool, outcome: failed ? 'error' : 'success',
        text: failed ? '工具执行失败' : '工具成功返回；此状态不能单独证明事项已交付' }
    }
    if (field(event, 'type') !== 'deliverables/presented') return
    const files = field(event.data, 'files')
    if (!Array.isArray(files)) return
    const paths = [...new Set(files.slice(0, 32).flatMap((file) => {
      const path = workspacePath(this.cwd, field(file, 'path'))
      return path === undefined ? [] : [path]
    }))]
    if (paths.length === 0) return
    return { ...base, kind: 'deliverable', outcome: 'success', text: '宿主已确认交付的工作区文件', paths }
  }
}
