import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AskKnowledgeQuestionRequest, YuanShuSseEvent } from '@deepseek-ai/dsh-yuanshu-client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ChatPanel.module.css'
import type { NS, YuanShuChatKey } from './locales.ts'
import { CapabilityDetail } from './CapabilityDetail.tsx'
import { QaPane } from './QaPane.tsx'
import {
  capabilityKey,
  failureKey,
  groupCapabilities,
  isRunnable,
  parseCapabilityKey,
  type CapabilityKind,
  type CapabilityOption,
} from './workbench.ts'

/** 会话页签与工作台共享的元枢能力调用面。 */
export interface YuanShuChatInjected {
  readonly askQuestionStream: (request: AskKnowledgeQuestionRequest, signal?: AbortSignal) => AsyncIterable<YuanShuSseEvent>
  readonly listCapabilities: () => Promise<readonly CapabilityOption[]>
  readonly runSkill: (id: string, input: unknown) => Promise<unknown>
  readonly runAlgorithm: (id: string, input: unknown) => Promise<unknown>
  readonly invokeDag: (id: string, input: unknown) => Promise<unknown>
  readonly listAlgorithmExecutions: (id: string) => Promise<unknown>
  readonly listDagHistory: (limit?: number, dagDefinitionId?: string) => Promise<unknown>
  readonly getDagHistoryDetail: (id: string) => Promise<unknown>
}

/** 能力分组标题。 */
function groupLabel(kind: CapabilityKind, t: (key: YuanShuChatKey) => string): string {
  switch (kind) {
    case 'skill': return t('groupSkill')
    case 'algorithm': return t('groupAlgorithm')
    case 'dag': return t('groupDag')
    case 'agent': return t('groupAgent')
    case 'worker': return t('groupWorker')
  }
}

/** 会话内入口：能力工具栏 + 问答或单个能力运行。 */
export function ChatPanel({
  askQuestionStream,
  listCapabilities,
  runSkill,
  runAlgorithm,
  invokeDag,
  listAlgorithmExecutions,
  listDagHistory,
  getDagHistoryDetail,
  t,
}: InjectFace<YuanShuChatInjected> & PropsLocale<typeof NS>): React.JSX.Element {
  const [capabilities, setCapabilities] = useState<readonly CapabilityOption[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const catalogLoadedRef = useRef(false)

  const [selectedKey, setSelectedKey] = useState('qa')

  const groups = useMemo(() => groupCapabilities(capabilities), [capabilities])
  const selectedCapability = useMemo(() => {
    const parsed = parseCapabilityKey(selectedKey)
    if (parsed === undefined || !isRunnable(parsed.kind)) return undefined
    return capabilities.find(capability => capability.kind === parsed.kind && capability.id === parsed.id)
  }, [selectedKey, capabilities])

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      setCapabilities(await listCapabilities())
    } catch (err) {
      setCapabilities([])
      setCatalogError(t(failureKey(err)))
    } finally {
      setCatalogLoading(false)
    }
  }, [listCapabilities, t])

  useEffect(() => {
    if (catalogLoadedRef.current) return
    catalogLoadedRef.current = true
    void loadCatalog()
  }, [loadCatalog])

  // 目录刷新后原选择可能消失（能力下线或权限变化），回到知识问答。
  useEffect(() => {
    if (selectedKey !== 'qa' && selectedCapability === undefined && !catalogLoading) setSelectedKey('qa')
  }, [selectedKey, selectedCapability, catalogLoading])

  return (
    <div className={css.container}>
      <div className={css.toolbar}>
        <select
          className={css.capabilitySelect}
          value={selectedKey}
          onChange={(e) => { setSelectedKey(e.target.value) }}
          aria-label={t('selectCapability')}
        >
          <option value="qa">{t('qaCapability')}</option>
          {groups.filter(group => group.kind !== 'qa' && isRunnable(group.kind)).map(group => (
            <optgroup key={group.kind} label={groupLabel(group.kind as CapabilityKind, t)}>
              {group.items.map(item => (
                <option key={capabilityKey(item)} value={capabilityKey(item)}>{item.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className={css.linkButton} disabled={catalogLoading} onClick={() => { void loadCatalog() }}>
          {catalogLoading ? t('capabilityLoading') : t('refreshCapabilities')}
        </button>
        {catalogError !== null && <span className={css.inlineError}>{catalogError}</span>}
        {catalogError === null && !catalogLoading && capabilities.length === 0 && (
          <span className={css.hint}>{t('capabilityEmpty')}</span>
        )}
      </div>
      {selectedCapability === undefined
        ? <QaPane askQuestionStream={askQuestionStream} t={t} />
        : (
          <CapabilityDetail
            capability={selectedCapability}
            runSkill={runSkill}
            runAlgorithm={runAlgorithm}
            invokeDag={invokeDag}
            listAlgorithmExecutions={listAlgorithmExecutions}
            listDagHistory={listDagHistory}
            getDagHistoryDetail={getDagHistoryDetail}
            t={t}
          />
        )}
    </div>
  )
}
