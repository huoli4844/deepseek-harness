import { useCallback, useEffect, useMemo, useState } from 'react'
import css from './ChatPanel.module.css'
import type { YuanShuChatKey } from './locales.ts'
import {
  buildFieldValues,
  buildSchemaInput,
  extractExecutionId,
  failureKey,
  findHistoryId,
  formatExecutionResult,
  isRunnable,
  parseJsonInput,
  schemaFields,
  toAlgorithmExecutionRows,
  toRunTimeline,
  type AlgorithmExecutionRow,
  type CapabilityOption,
  type RunTimeline,
  type SchemaField,
} from './workbench.ts'

/** 工作台可以直接执行的能力调用。 */
export interface CapabilityRunInjected {
  readonly runSkill: (id: string, input: unknown) => Promise<unknown>
  readonly runAlgorithm: (id: string, input: unknown) => Promise<unknown>
  readonly invokeDag: (id: string, input: unknown) => Promise<unknown>
  readonly listAlgorithmExecutions: (id: string) => Promise<unknown>
  readonly listDagHistory: (limit?: number, dagDefinitionId?: string) => Promise<unknown>
  readonly getDagHistoryDetail: (id: string) => Promise<unknown>
}

/** 单个能力的详情、入参表单、运行结果与历史。 */
export interface CapabilityDetailProps extends CapabilityRunInjected {
  readonly capability: CapabilityOption
  readonly t: (key: YuanShuChatKey) => string
}

/**
 * 渲染一个已选能力的运行工作区。
 *
 * 可见性、授权和参数校验最终由元枢裁决；这里只负责把 401/403/404/429
 * 翻译成稳定的界面状态，并阻止资源型 Skill 的必然失败执行。
 */
export function CapabilityDetail({
  capability,
  runSkill,
  runAlgorithm,
  invokeDag,
  listAlgorithmExecutions,
  listDagHistory,
  getDagHistoryDetail,
  t,
}: CapabilityDetailProps) {
  const [jsonInput, setJsonInput] = useState('')
  const [inputMode, setInputMode] = useState<'form' | 'json'>('json')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [history, setHistory] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [executionRows, setExecutionRows] = useState<readonly AlgorithmExecutionRow[]>([])
  const [timeline, setTimeline] = useState<RunTimeline | undefined>(undefined)
  const [timelineLoading, setTimelineLoading] = useState(false)

  const fields = useMemo(() => schemaFields(capability.inputSchema), [capability])
  const formAvailable = fields.length > 0
  // 资源型 Skill 由 Agent 装载使用，服务端会返回 422；工作台提前禁用执行。
  const canRun = isRunnable(capability.kind, capability.executable)

  // 切换能力时重置入参：有 schema 默认进入表单模式，否则退回 JSON 模式。
  useEffect(() => {
    setFieldValues(buildFieldValues(fields))
    setInputMode(fields.length > 0 ? 'form' : 'json')
    setJsonInput('')
    setTimeline(undefined)
    setExecutionRows([])
    setHistory(null)
    setHistoryLoaded(false)
    setRunError(null)
    setResult(null)
  }, [capability, fields])

  // DAG 运行详情是增强信息：失败时只放弃时间线，不覆盖主结果。
  const loadTimeline = useCallback(async (dagDefinitionId: string, executionId: string | undefined) => {
    if (executionId === undefined) return
    setTimelineLoading(true)
    try {
      const historyValue = await listDagHistory(20, dagDefinitionId)
      const historyId = findHistoryId(historyValue, executionId)
      if (historyId === undefined) return
      setTimeline(toRunTimeline(await getDagHistoryDetail(historyId)))
    } catch {
      setTimeline(undefined)
    } finally {
      setTimelineLoading(false)
    }
  }, [listDagHistory, getDagHistoryDetail])

  const handleRun = useCallback(async () => {
    if (!canRun || running) return
    const parsed = formAvailable && inputMode === 'form'
      ? buildSchemaInput(fields, fieldValues)
      : parseJsonInput(jsonInput)
    if (!parsed.ok) {
      setRunError(t(formAvailable && inputMode === 'form' ? 'invalidInput' : 'invalidJson'))
      return
    }
    setRunning(true)
    setRunError(null)
    setResult(null)
    setHistory(null)
    setHistoryLoaded(false)
    setExecutionRows([])
    setTimeline(undefined)
    try {
      const value = capability.kind === 'skill'
        ? await runSkill(capability.id, parsed.value)
        : capability.kind === 'algorithm'
          ? await runAlgorithm(capability.id, parsed.value)
          : await invokeDag(capability.id, parsed.value)
      setResult(formatExecutionResult(value))
      if (capability.kind === 'dag') {
        void loadTimeline(capability.id, extractExecutionId(value))
      }
    } catch (err) {
      setRunError(t(failureKey(err)))
    } finally {
      setRunning(false)
    }
  }, [
    canRun, running, formAvailable, inputMode, fields, fieldValues, jsonInput, capability,
    runSkill, runAlgorithm, invokeDag, loadTimeline, t,
  ])

  const handleHistory = useCallback(async () => {
    if (historyLoading) return
    setHistoryLoading(true)
    setRunError(null)
    setHistoryLoaded(false)
    try {
      if (capability.kind === 'algorithm') {
        setExecutionRows(toAlgorithmExecutionRows(await listAlgorithmExecutions(capability.id)))
        setHistory(null)
      } else if (capability.kind === 'dag') {
        setExecutionRows([])
        setHistory(formatExecutionResult(await listDagHistory(20, capability.id)))
      }
      setHistoryLoaded(true)
    } catch (err) {
      setRunError(t(failureKey(err)))
    } finally {
      setHistoryLoading(false)
    }
  }, [capability, historyLoading, listAlgorithmExecutions, listDagHistory, t])

  const handleRefreshTimeline = useCallback(() => {
    if (timeline === undefined) return
    void loadTimeline(capability.id, timeline.executionId)
  }, [capability, timeline, loadTimeline])

  const renderFieldControl = (field: SchemaField) => {
    const value = fieldValues[field.name] ?? ''
    const setValue = (next: string) => { setFieldValues(prev => ({ ...prev, [field.name]: next })) }
    if (field.type === 'boolean') {
      return (
        <select
          className={css.fieldInput}
          value={value}
          disabled={running}
          aria-label={field.name}
          onChange={(e) => { setValue(e.target.value) }}
        >
          <option value="">{t('fieldUnset')}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )
    }
    if (field.type === 'enum') {
      return (
        <select
          className={css.fieldInput}
          value={value}
          disabled={running}
          aria-label={field.name}
          onChange={(e) => { setValue(e.target.value) }}
        >
          <option value="">{t('fieldUnset')}</option>
          {(field.enum ?? []).map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      )
    }
    if (field.type === 'object' || field.type === 'array') {
      return (
        <textarea
          className={css.jsonInput}
          rows={3}
          value={value}
          disabled={running}
          aria-label={field.name}
          placeholder={field.type === 'object' ? '{}' : '[]'}
          onChange={(e) => { setValue(e.target.value) }}
        />
      )
    }
    return (
      <input
        className={css.fieldInput}
        type={field.type === 'number' ? 'number' : 'text'}
        value={value}
        disabled={running}
        aria-label={field.name}
        onChange={(e) => { setValue(e.target.value) }}
      />
    )
  }

  return (
    <div className={css.workspace}>
      <div className={css.capabilityHeader}>
        <div className={css.capabilityName}>{capability.name}</div>
        {capability.description !== undefined && (
          <div className={css.capabilityDescription}>{capability.description}</div>
        )}
      </div>
      {capability.executable !== false ? (
        <>
          {formAvailable && (
            <div className={css.modeSwitch} role="group" aria-label={t('selectCapability')}>
              <button
                className={inputMode === 'form' ? css.modeButtonActive : css.modeButton}
                aria-pressed={inputMode === 'form'}
                onClick={() => { setInputMode('form') }}
              >
                {t('formMode')}
              </button>
              <button
                className={inputMode === 'json' ? css.modeButtonActive : css.modeButton}
                aria-pressed={inputMode === 'json'}
                onClick={() => { setInputMode('json') }}
              >
                {t('jsonMode')}
              </button>
            </div>
          )}
          {formAvailable && inputMode === 'form' ? (
            <div className={css.schemaForm}>
              {fields.map(field => (
                <div key={field.name} className={css.field}>
                  <div className={css.fieldLabel}>
                    {field.name}
                    {field.required && <span className={css.requiredMark}>*</span>}
                  </div>
                  {renderFieldControl(field)}
                  {field.description !== undefined && <div className={css.fieldHint}>{field.description}</div>}
                </div>
              ))}
            </div>
          ) : (
            <textarea
              className={css.jsonInput}
              value={jsonInput}
              onChange={(e) => { setJsonInput(e.target.value) }}
              placeholder={t('jsonInputHint')}
              rows={8}
              disabled={running}
            />
          )}
          <div className={css.actions}>
            <button className={css.primaryButton} disabled={running} onClick={() => { void handleRun() }}>
              {running ? t('running') : t('run')}
            </button>
            {(capability.kind === 'algorithm' || capability.kind === 'dag') && (
              <button className={css.secondaryButton} disabled={historyLoading} onClick={() => { void handleHistory() }}>
                {historyLoading ? t('capabilityLoading') : t('loadHistory')}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className={css.hint}>{t('resourceSkillHint')}</div>
      )}
      {runError !== null && <div className={css.error}>{runError}</div>}
      {result !== null && (
        <div className={css.result}>
          <div className={css.resultLabel}>{t('result')}</div>
          <pre className={css.resultBody}>{result}</pre>
        </div>
      )}
      {timeline !== undefined && (
        <div className={css.timeline}>
          <div className={css.timelineHeader}>
            <div className={css.resultLabel}>{t('runTimeline')}</div>
            <button className={css.linkButton} disabled={timelineLoading} onClick={handleRefreshTimeline}>
              {timelineLoading ? t('capabilityLoading') : t('refresh')}
            </button>
          </div>
          <div className={css.timelineSummary}>
            <span className={css.statusChip}>{timeline.status}</span>
            <span>{timeline.durationMs} {t('milliseconds')}</span>
            <span className={css.mono}>{timeline.executionId}</span>
          </div>
          {timeline.nodes.length === 0 ? (
            <div className={css.hint}>{t('emptyTimeline')}</div>
          ) : (
            <ol className={css.timelineList}>
              {timeline.nodes.map(node => (
                <li key={node.nodeId} className={css.timelineItem}>
                  <span className={`${css.nodeDot} ${node.status === 'success' ? css.nodeDotSuccess : node.status === 'failed' ? css.nodeDotFailed : ''}`} />
                  <div className={css.timelineBody}>
                    <div className={css.timelineTitle}>
                      {node.label}
                      {node.type.length > 0 && <span className={css.nodeType}>{node.type}</span>}
                    </div>
                    <div className={css.timelineSummary}>
                      <span>{node.status}</span>
                      <span>{node.durationMs} {t('milliseconds')}</span>
                      {node.startedAt.length > 0 && <span className={css.mono}>{node.startedAt}</span>}
                    </div>
                    {node.error !== undefined && <div className={css.inlineError}>{node.error}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {executionRows.length > 0 && (
        <div className={css.result}>
          <div className={css.resultLabel}>{t('executions')}</div>
          <ul className={css.executionList}>
            {executionRows.map(row => (
              <li key={row.id} className={css.executionRow}>
                <span className={css.statusChip}>{row.status}</span>
                <span className={css.mono}>{row.id}</span>
                <span>{row.durationMs} {t('milliseconds')}</span>
                {row.createdAt.length > 0 && <span className={css.mono}>{row.createdAt}</span>}
                {row.error !== undefined && <span className={css.inlineError}>{row.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {historyLoaded && executionRows.length === 0 && capability.kind === 'algorithm' && (
        <div className={css.hint}>{t('emptyExecutions')}</div>
      )}
      {history !== null && (
        <div className={css.result}>
          <div className={css.resultLabel}>{t('history')}</div>
          <pre className={css.resultBody}>{history}</pre>
        </div>
      )}
    </div>
  )
}
