import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AskKnowledgeQuestionRequest,
  YuanShuHomeMetrics,
  YuanShuSseEvent,
  YuanShuWorkbenchHome,
  YuanShuWorkbenchProfile,
} from '@deepseek-ai/dsh-yuanshu-client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WorkbenchPanel.module.css'
import { CapabilityDetail } from './CapabilityDetail.tsx'
import { QaPane } from './QaPane.tsx'
import { clearQaSession, readActiveTenant, writeActiveTenant } from './storage.ts'
import type { NS, YuanShuChatKey } from './locales.ts'
import {
  failureKey,
  toCatalogRows,
  toOverviewEntries,
  type CapabilityKind,
  type CapabilityOption,
  type CatalogRow,
  type WorkbenchSection,
} from './workbench.ts'

/** 工作台主视图注入面。 */
export interface YuanShuWorkbenchInjected {
  readonly askQuestionStream: (request: AskKnowledgeQuestionRequest, signal?: AbortSignal) => AsyncIterable<YuanShuSseEvent>
  readonly listCapabilities: () => Promise<readonly CapabilityOption[]>
  readonly runSkill: (id: string, input: unknown) => Promise<unknown>
  readonly runAlgorithm: (id: string, input: unknown) => Promise<unknown>
  readonly invokeDag: (id: string, input: unknown) => Promise<unknown>
  readonly listAlgorithmExecutions: (id: string) => Promise<unknown>
  readonly listDagHistory: (limit?: number, dagDefinitionId?: string) => Promise<unknown>
  readonly getDagHistoryDetail: (id: string) => Promise<unknown>
  readonly getWorkbenchProfile: () => Promise<YuanShuWorkbenchProfile>
  readonly getWorkbenchHome: () => Promise<YuanShuWorkbenchHome>
  readonly getCurrentUser: () => Promise<unknown>
  readonly listTenants: () => Promise<unknown>
  readonly listOntologyOverview: () => Promise<unknown>
  readonly listOntologySpaces: () => Promise<unknown>
  readonly listOntologyCollections: () => Promise<unknown>
  readonly listOntologyReleases: () => Promise<unknown>
  readonly listScenarios: () => Promise<unknown>
  readonly listKnowledgeCollections: () => Promise<unknown>
}

interface CatalogGroup {
  readonly titleKey: YuanShuChatKey
  readonly rows: readonly CatalogRow[]
}

interface SectionState {
  readonly loading: boolean
  readonly error?: YuanShuChatKey
  readonly overview?: readonly { label: string; value: string }[]
  readonly groups?: readonly CatalogGroup[]
}

/** 岗位工作台首页状态。profile 与 home 独立失败，缺一个仍能渲染另一个。 */
interface HomeState {
  readonly loading: boolean
  readonly profile?: YuanShuWorkbenchProfile
  readonly home?: YuanShuWorkbenchHome
  readonly profileError?: YuanShuChatKey
  readonly homeError?: YuanShuChatKey
}

interface NavItem {
  readonly section: WorkbenchSection
  readonly glyph: string
  readonly labelKey: YuanShuChatKey
}

/** 左侧导航按入口分组：工作台、知识问答、能力库。 */
const NAV_GROUPS: readonly { readonly titleKey: YuanShuChatKey; readonly items: readonly NavItem[] }[] = [
  {
    titleKey: 'navGroupWorkbench',
    items: [{ section: 'home', glyph: '⌂', labelKey: 'navHome' }],
  },
  {
    titleKey: 'navGroupKnowledge',
    items: [
      { section: 'qa', glyph: '✎', labelKey: 'navQa' },
      { section: 'knowledge', glyph: '▤', labelKey: 'navKnowledge' },
    ],
  },
  {
    titleKey: 'navGroupCapabilities',
    items: [
      { section: 'overview', glyph: '◈', labelKey: 'navOverview' },
      { section: 'ontology', glyph: '◎', labelKey: 'navOntology' },
      { section: 'skill', glyph: '◇', labelKey: 'navSkill' },
      { section: 'algorithm', glyph: '∑', labelKey: 'navAlgorithm' },
      { section: 'scenario', glyph: '▣', labelKey: 'navScenario' },
      { section: 'dag', glyph: '⌘', labelKey: 'navDag' },
    ],
  },
]

const SECTION_TITLES: Readonly<Record<WorkbenchSection, YuanShuChatKey>> = {
  home: 'navHome',
  overview: 'overviewTitle',
  ontology: 'navOntology',
  skill: 'navSkill',
  algorithm: 'navAlgorithm',
  scenario: 'navScenario',
  dag: 'navDag',
  knowledge: 'navKnowledge',
  qa: 'navQa',
}

/** 能力分组到工作台分组的映射，用于在导航里显示计数。 */
const CAPABILITY_SECTION: Readonly<Record<CapabilityKind, WorkbenchSection>> = {
  skill: 'skill',
  algorithm: 'algorithm',
  dag: 'dag',
  agent: 'scenario',
  worker: 'scenario',
}

/** 首页区块顺序的兜底值，正常由元枢 `sections` 字段决定。 */
const HOME_SECTIONS = ['metrics', 'risks', 'gates', 'milestones', 'tasks', 'scenes'] as const

/** 首页指标卡。顺序即展示顺序。 */
const HOME_METRICS: readonly { readonly key: keyof YuanShuHomeMetrics; readonly labelKey: YuanShuChatKey }[] = [
  { key: 'project_total', labelKey: 'metricProjectTotal' },
  { key: 'active_projects', labelKey: 'metricActiveProjects' },
  { key: 'open_risks', labelKey: 'metricOpenRisks' },
  { key: 'high_risks', labelKey: 'metricHighRisks' },
  { key: 'open_tasks', labelKey: 'metricOpenTasks' },
  { key: 'overdue_tasks', labelKey: 'metricOverdueTasks' },
  { key: 'pending_gates', labelKey: 'metricPendingGates' },
  { key: 'milestones_due_30d', labelKey: 'metricMilestonesDue30' },
]

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function profileName(value: unknown): string | undefined {
  const record = recordOf(value)
  if (record === undefined) return undefined
  for (const key of ['nickname', 'username', 'name']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
  }
  return undefined
}

/** 只保留日期部分，避免把时间戳整串塞进摘要行。 */
function dateLabel(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return value.length >= 10 ? value.slice(0, 10) : value
}

/** 元枢岗位工作台：首页投影 + 知识问答 + 能力库。 */
export function WorkbenchPanel({
  askQuestionStream,
  listCapabilities,
  runSkill,
  runAlgorithm,
  invokeDag,
  listAlgorithmExecutions,
  listDagHistory,
  getDagHistoryDetail,
  getWorkbenchProfile,
  getWorkbenchHome,
  getCurrentUser,
  listTenants,
  listOntologyOverview,
  listOntologySpaces,
  listOntologyCollections,
  listOntologyReleases,
  listScenarios,
  listKnowledgeCollections,
  t,
}: InjectFace<YuanShuWorkbenchInjected> & PropsLocale<typeof NS>): React.JSX.Element {
  const [section, setSection] = useState<WorkbenchSection>('home')
  const [selected, setSelected] = useState<CapabilityOption>()
  const [capabilities, setCapabilities] = useState<readonly CapabilityOption[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<YuanShuChatKey>()
  const [profile, setProfile] = useState<Record<string, unknown>>({})
  const [tenants, setTenants] = useState<readonly CatalogRow[]>([])
  const [tenant, setTenant] = useState<string | undefined>(() => readActiveTenant())
  const [identityReady, setIdentityReady] = useState(false)
  const [sections, setSections] = useState<Partial<Record<WorkbenchSection, SectionState>>>({})
  // 首帧即视为加载中，避免在 identity 返回前先闪一次“加载失败”。
  const [home, setHome] = useState<HomeState>({ loading: true })

  const loadedRef = useRef(new Set<WorkbenchSection>())
  const loadingRef = useRef(new Set<WorkbenchSection>())
  const catalogLoadedRef = useRef(false)
  const identityLoadedRef = useRef(false)
  const homeLoadedRef = useRef(false)

  const counts = useMemo(() => {
    const result: Record<string, number> = { skill: 0, algorithm: 0, dag: 0, scenario: 0 }
    for (const capability of capabilities) {
      const target = CAPABILITY_SECTION[capability.kind]
      result[target] = (result[target] ?? 0) + 1
    }
    return result
  }, [capabilities])

  // 场景与知识库的目录接口独立于能力清单，计数以实际加载结果为准。
  const navCounts = useMemo<Record<WorkbenchSection, number | undefined>>(() => ({
    home: undefined,
    overview: undefined,
    ontology: undefined,
    skill: counts.skill,
    algorithm: counts.algorithm,
    dag: counts.dag,
    scenario: sections.scenario?.groups?.[0]?.rows.length ?? counts.scenario ?? 0,
    knowledge: sections.knowledge?.groups?.[0]?.rows.length,
    qa: undefined,
  }), [counts, sections])

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError(undefined)
    try {
      setCapabilities(await listCapabilities())
    } catch (err) {
      setCapabilities([])
      setCatalogError(failureKey(err))
    } finally {
      setCatalogLoading(false)
    }
  }, [listCapabilities])

  const loadIdentity = useCallback(async () => {
    const [user, tenantPayload] = await Promise.allSettled([getCurrentUser(), listTenants()])
    if (user.status === 'fulfilled') {
      setProfile(recordOf(user.value) ?? {})
    }
    if (tenantPayload.status === 'fulfilled') {
      setTenants(toCatalogRows(tenantPayload.value))
      // 未显式选择租户时沿用 token 的当前租户。元枢知识集合等目录接口要求显式
      // 租户上下文，缺省会返回 403，不能把“未选择”当成“无租户”。
      if (readActiveTenant() === undefined) {
        const current = recordOf(recordOf(tenantPayload.value)?.current)
        const id = current?.id
        if (typeof id === 'number' || (typeof id === 'string' && id.length > 0)) {
          writeActiveTenant(String(id))
          setTenant(String(id))
        }
      }
    }
    setIdentityReady(true)
  }, [getCurrentUser, listTenants])

  // 岗位工作台首页：profile 决定岗位/角色/数据范围，home 决定指标与区块顺序。
  // profile 失败只降级为通用视图，不阻断首页可用性。
  const loadHome = useCallback(async () => {
    // 保留上一次成功结果，刷新时只清错误，不清空已渲染内容。
    setHome(prev => ({
      loading: true,
      ...(prev.profile === undefined ? {} : { profile: prev.profile }),
      ...(prev.home === undefined ? {} : { home: prev.home }),
    }))
    const [profileResult, homeResult] = await Promise.allSettled([getWorkbenchProfile(), getWorkbenchHome()])
    setHome({
      loading: false,
      ...(profileResult.status === 'fulfilled'
        ? { profile: profileResult.value }
        : { profileError: failureKey(profileResult.reason) }),
      ...(homeResult.status === 'fulfilled'
        ? { home: homeResult.value }
        : { homeError: failureKey(homeResult.reason) }),
    })
  }, [getWorkbenchProfile, getWorkbenchHome])

  useEffect(() => {
    if (identityLoadedRef.current) return
    identityLoadedRef.current = true
    void loadIdentity()
  }, [loadIdentity])

  useEffect(() => {
    if (!identityReady || catalogLoadedRef.current) return
    catalogLoadedRef.current = true
    void loadCatalog()
  }, [identityReady, loadCatalog])

  useEffect(() => {
    if (!identityReady || homeLoadedRef.current) return
    homeLoadedRef.current = true
    void loadHome()
  }, [identityReady, loadHome])

  const loadSection = useCallback(async (target: WorkbenchSection) => {
    if (target === 'home' || target === 'overview' || target === 'qa') return
    if (loadedRef.current.has(target) || loadingRef.current.has(target)) return
    loadingRef.current.add(target)
    setSections(prev => ({ ...prev, [target]: { loading: true } }))

    try {
      let groups: readonly CatalogGroup[]
      let overview: readonly { label: string; value: string }[] | undefined
      if (target === 'ontology') {
        const [overviewValue, spaces, collections, releases] = await Promise.all([
          listOntologyOverview(),
          listOntologySpaces(),
          listOntologyCollections(),
          listOntologyReleases(),
        ])
        overview = toOverviewEntries(overviewValue)
        groups = [
          { titleKey: 'ontologySpaces', rows: toCatalogRows(spaces) },
          { titleKey: 'ontologyCollections', rows: toCatalogRows(collections) },
          { titleKey: 'ontologyReleases', rows: toCatalogRows(releases) },
        ]
      } else if (target === 'scenario') {
        groups = [{ titleKey: 'scenarioList', rows: toCatalogRows(await listScenarios()) }]
      } else if (target === 'knowledge') {
        groups = [{ titleKey: 'knowledgeList', rows: toCatalogRows(await listKnowledgeCollections()) }]
      } else {
        groups = []
      }

      loadedRef.current.add(target)
      setSections(prev => ({
        ...prev,
        [target]: {
          loading: false,
          ...(overview === undefined ? {} : { overview }),
          groups,
        },
      }))
    } catch (err) {
      const key = failureKey(err)
      setSections(prev => ({
        ...prev,
        [target]: {
          loading: false,
          error: target === 'ontology' && key === 'permissionDenied' ? 'noOntologyAccess' : key,
        },
      }))
    } finally {
      loadingRef.current.delete(target)
    }
  }, [listOntologyOverview, listOntologySpaces, listOntologyCollections, listOntologyReleases, listScenarios, listKnowledgeCollections])

  useEffect(() => {
    if (!identityReady) return
    void loadSection(section)
  }, [identityReady, section, loadSection])

  // 概览与导航计数需要场景、知识库条目数，进入工作台时各预取一次。
  useEffect(() => {
    if (!identityReady) return
    void loadSection('scenario')
    void loadSection('knowledge')
  }, [identityReady, loadSection])

  const selectSection = useCallback((next: WorkbenchSection) => {
    setSelected(undefined)
    setSection(next)
  }, [])

  // 切换租户后所有目录、计数、岗位投影与问答会话都属于新租户，必须整体失效重载。
  const changeTenant = useCallback((next: string) => {
    const value = next.length === 0 ? undefined : next
    writeActiveTenant(value)
    setTenant(value)
    clearQaSession()
    loadedRef.current.clear()
    loadingRef.current.clear()
    homeLoadedRef.current = true
    setSections({})
    setSelected(undefined)
    setSection('home')
    void loadCatalog()
    void loadIdentity()
    void loadHome()
    void loadSection('scenario')
    void loadSection('knowledge')
  }, [loadCatalog, loadIdentity, loadHome, loadSection])

  const sectionCapabilities = useMemo(() => {
    return capabilities.filter(capability => CAPABILITY_SECTION[capability.kind] === section)
  }, [capabilities, section])

  const sectionState = sections[section]
  const catalogSection = section === 'overview' || section === 'skill' || section === 'algorithm' || section === 'dag'
  const errorKey = sectionState?.error ?? (catalogSection ? catalogError : undefined)

  const workbenchName = home.profile?.workbench.name ?? home.home?.workbench.name
  const accountName = home.profile?.nickname || home.profile?.username || profileName(profile) || t('unknownUser')
  const activeRoles = home.profile?.active_roles ?? []
  const dataScope = home.home?.data_scope.description ?? home.profile?.data_scope.description

  const renderCatalogGroups = (groups: readonly CatalogGroup[]) => (
    <>
      {groups.map(group => (
        <div key={group.titleKey} className={css.group}>
          <div className={css.groupTitle}>{t(group.titleKey)}</div>
          {group.rows.length === 0
            ? <div className={css.empty}>{t('sectionEmpty')}</div>
            : (
              <ul className={css.list}>
                {group.rows.map(row => (
                  <li key={`${group.titleKey}:${row.id}`} className={css.row}>
                    <div className={css.rowName}>{row.name}</div>
                    {row.description !== undefined && <div className={css.rowDesc}>{row.description}</div>}
                    {row.status !== undefined && <span className={css.rowStatus}>{row.status}</span>}
                  </li>
                ))}
              </ul>
            )}
        </div>
      ))}
    </>
  )

  const renderOverview = () => (
    <div className={css.overviewGrid}>
      {(['skill', 'algorithm', 'dag', 'scenario'] as const).map(kind => (
        <div key={kind} className={css.statCard}>
          <span className={css.statLabel}>{t(SECTION_TITLES[kind])}</span>
          <span className={css.statValue}>{navCounts[kind] ?? 0}</span>
        </div>
      ))}
      <div className={css.statCard}>
        <span className={css.statLabel}>{t('navKnowledge')}</span>
        <span className={css.statValue}>{navCounts.knowledge ?? 0}</span>
      </div>
    </div>
  )

  const renderOntology = () => (
    <>
      {sectionState?.overview !== undefined && sectionState.overview.length > 0 && (
        <div className={css.group}>
          <div className={css.groupTitle}>{t('ontologyOverview')}</div>
          <div className={css.kv}>
            {sectionState.overview.map(entry => (
              <div key={entry.label} className={css.kvRow}>
                <span className={css.kvKey}>{entry.label}</span>
                <span className={css.kvValue}>{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {renderCatalogGroups(sectionState?.groups ?? [])}
    </>
  )

  const renderCapabilityCatalog = () => {
    if (catalogLoading) return <div className={css.empty}>{t('capabilityLoading')}</div>
    if (sectionCapabilities.length === 0) return <div className={css.empty}>{t('capabilityEmpty')}</div>
    return (
      <ul className={css.list}>
        {sectionCapabilities.map(capability => (
          <li key={`${capability.kind}:${capability.id}`}>
            <button className={`${css.row} ${css.rowButton}`} onClick={() => { setSelected(capability) }}>
              <span className={css.rowName}>{capability.name}</span>
              {capability.description !== undefined && <span className={css.rowDesc}>{capability.description}</span>}
              {capability.executable === false && <span className={css.rowStatus}>{t('resourceSkillHint')}</span>}
            </button>
          </li>
        ))}
      </ul>
    )
  }

  const renderHomeBlock = (titleKey: YuanShuChatKey, content: React.ReactNode, count?: number) => (
    <section className={css.homeBlock}>
      <div className={css.blockHeader}>
        <span className={css.blockTitle}>{t(titleKey)}</span>
        {count !== undefined && <span className={css.blockCount}>{count}</span>}
      </div>
      {content}
    </section>
  )

  const renderMetrics = (metrics: YuanShuHomeMetrics) => (
    <div className={css.metricGrid}>
      {HOME_METRICS.map(item => (
        <div key={item.key} className={css.metricCard}>
          <span className={css.metricValue}>{metrics[item.key]}</span>
          <span className={css.metricLabel}>{t(item.labelKey)}</span>
        </div>
      ))}
    </div>
  )

  const renderRiskSection = (value: YuanShuWorkbenchHome) => {
    if (value.risks.length === 0) return renderHomeBlock('homeRisks', <div className={css.empty}>{t('sectionEmpty')}</div>, 0)
    return renderHomeBlock('homeRisks', (
      <ul className={css.list}>
        {value.risks.map((risk) => {
          const deadline = dateLabel(risk.deadline)
          return (
            <li key={risk.id} className={css.row}>
              <div className={css.rowHead}>
                <span className={css.rowName}>{risk.title}</span>
                <span className={`${css.badge} ${risk.risk_level === 'critical' || risk.risk_level === 'high' ? css.badgeDanger : ''}`}>
                  {risk.risk_level}
                </span>
              </div>
              <div className={css.rowDesc}>
                {risk.project_name} · {risk.risk_code} · {risk.status}
                {risk.handler_name !== undefined && risk.handler_name.length > 0 ? ` · ${risk.handler_name}` : ''}
              </div>
              {deadline !== undefined && <div className={css.rowMeta}>{t('deadline')} {deadline}</div>}
            </li>
          )
        })}
      </ul>
    ), value.risks.length)
  }

  const renderTaskSection = (value: YuanShuWorkbenchHome) => {
    if (value.tasks.length === 0) return renderHomeBlock('homeTasks', <div className={css.empty}>{t('sectionEmpty')}</div>, 0)
    return renderHomeBlock('homeTasks', (
      <ul className={css.list}>
        {value.tasks.map((task) => {
          const planEnd = dateLabel(task.plan_end)
          return (
            <li key={task.id} className={css.row}>
              <div className={css.rowHead}>
                <span className={css.rowName}>{task.name}</span>
                {task.overdue && <span className={`${css.badge} ${css.badgeDanger}`}>{t('overdue')}</span>}
                <span className={css.badge}>{task.priority}</span>
              </div>
              <div className={css.rowDesc}>
                {task.project_name} · {task.code} · {task.status}
                {task.owner_name !== undefined && task.owner_name.length > 0 ? ` · ${task.owner_name}` : ''}
              </div>
              {planEnd !== undefined && <div className={css.rowMeta}>{t('planEnd')} {planEnd}</div>}
            </li>
          )
        })}
      </ul>
    ), value.tasks.length)
  }

  const renderGateSection = (value: YuanShuWorkbenchHome) => {
    if (value.gates.length === 0) return renderHomeBlock('homeGates', <div className={css.empty}>{t('sectionEmpty')}</div>, 0)
    return renderHomeBlock('homeGates', (
      <ul className={css.list}>
        {value.gates.map((gate) => {
          const planned = dateLabel(gate.planned_date)
          return (
            <li key={gate.id} className={css.row}>
              <div className={css.rowHead}>
                <span className={css.rowName}>{gate.gate_name}</span>
                <span className={css.badge}>{gate.gate_status}</span>
              </div>
              <div className={css.rowDesc}>{gate.project_name} · {gate.gate_code}</div>
              {planned !== undefined && <div className={css.rowMeta}>{t('plannedDate')} {planned}</div>}
            </li>
          )
        })}
      </ul>
    ), value.gates.length)
  }

  const renderMilestoneSection = (value: YuanShuWorkbenchHome) => {
    if (value.milestones.length === 0) return renderHomeBlock('homeMilestones', <div className={css.empty}>{t('sectionEmpty')}</div>, 0)
    return renderHomeBlock('homeMilestones', (
      <ul className={css.list}>
        {value.milestones.map((milestone) => {
          const planned = dateLabel(milestone.plan_date)
          return (
            <li key={milestone.id} className={css.row}>
              <div className={css.rowHead}>
                <span className={css.rowName}>{milestone.name}</span>
                <span className={css.badge}>{milestone.status}</span>
              </div>
              <div className={css.rowDesc}>{milestone.project_name} · {milestone.code}</div>
              <div className={css.rowMeta}>
                {planned !== undefined && <span>{t('plannedDate')} {planned}</span>}
                <span>{t('daysLeft')} {milestone.days_left}</span>
              </div>
            </li>
          )
        })}
      </ul>
    ), value.milestones.length)
  }

  const renderSceneSection = (value: YuanShuWorkbenchHome) => {
    if (value.scenes.length === 0) return renderHomeBlock('homeScenes', <div className={css.empty}>{t('sectionEmpty')}</div>, 0)
    return renderHomeBlock('homeScenes', (
      <div className={css.sceneGrid}>
        {value.scenes.map(scene => (
          <div key={scene.code} className={css.sceneCard}>
            <div className={css.rowHead}>
              <span className={css.rowName}>{scene.title}</span>
              <span className={`${css.badge} ${scene.available ? '' : css.badgeMuted}`}>
                {scene.available ? t('sceneAvailable') : t('sceneUnavailable')}
              </span>
            </div>
            <div className={css.rowDesc}>{scene.description}</div>
            <div className={css.rowMeta}>{scene.plugin_id}{scene.entry.length > 0 ? ` · ${scene.entry}` : ''}</div>
          </div>
        ))}
      </div>
    ), value.scenes.length)
  }

  const renderHomeSection = (code: string, value: YuanShuWorkbenchHome) => {
    switch (code) {
      case 'metrics':
        return <div key={code} className={css.homeBlock}>{renderMetrics(value.metrics)}</div>
      case 'risks':
        return <div key={code}>{renderRiskSection(value)}</div>
      case 'tasks':
        return <div key={code}>{renderTaskSection(value)}</div>
      case 'gates':
        return <div key={code}>{renderGateSection(value)}</div>
      case 'milestones':
        return <div key={code}>{renderMilestoneSection(value)}</div>
      case 'scenes':
        return <div key={code}>{renderSceneSection(value)}</div>
      default:
        // 未知区块只占位，不猜测语义，也不让整页渲染失败。
        return renderHomeBlock('sectionUnknown', <div className={css.empty}>{t('sectionEmpty')}</div>)
    }
  }

  const renderHome = () => {
    if (home.loading && home.home === undefined) return <div className={css.empty}>{t('homeLoading')}</div>
    if (home.home === undefined) return <div className={css.error}>{t(home.homeError ?? 'homeFailed')}</div>
    const value = home.home
    const order = value.sections.length > 0 ? [...value.sections] : [...HOME_SECTIONS]
    return (
      <>
        {home.profileError !== undefined && (
          <div className={css.notice}>{t('profileFallback')}</div>
        )}
        <div className={css.hero}>
          <div className={css.heroMain}>
            <div className={css.heroTitle}>{workbenchName ?? t('navHome')}</div>
            <div className={css.heroMeta}>
              {[accountName, home.profile?.department.name, value.tenant.name].filter(
                (item): item is string => typeof item === 'string' && item.length > 0,
              ).join(' · ')}
            </div>
            {activeRoles.length > 0 && (
              <div className={css.chips}>
                <span className={css.chipLabel}>{t('roleLabel')}</span>
                {activeRoles.map(role => <span key={role.code} className={css.chip}>{role.name}</span>)}
              </div>
            )}
          </div>
          <div className={css.heroSide}>
            <label className={css.tenantLabel}>
              <span>{t('activeTenant')}</span>
              <select
                className={css.tenantSelect}
                aria-label={t('activeTenant')}
                value={tenant ?? ''}
                onChange={(event) => { changeTenant(event.target.value) }}
              >
                <option value="">{t('tenantDefault')}</option>
                {tenants.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            {dataScope !== undefined && dataScope.length > 0 && (
              <div className={css.scope}>{t('dataScope')}：{dataScope}</div>
            )}
          </div>
        </div>
        {order.map(code => renderHomeSection(code, value))}
      </>
    )
  }

  const renderBody = () => {
    if (selected !== undefined) {
      return (
        <>
          <div className={css.backBar}>
            <button className={css.backButton} onClick={() => { setSelected(undefined) }}>← {t('backToCatalog')}</button>
          </div>
          <CapabilityDetail
            capability={selected}
            runSkill={runSkill}
            runAlgorithm={runAlgorithm}
            invokeDag={invokeDag}
            listAlgorithmExecutions={listAlgorithmExecutions}
            listDagHistory={listDagHistory}
            getDagHistoryDetail={getDagHistoryDetail}
            t={t}
          />
        </>
      )
    }
    if (section === 'home') return renderHome()
    if (section === 'qa') return <QaPane key={tenant ?? 'default'} askQuestionStream={askQuestionStream} t={t} />
    if (errorKey !== undefined) return <div className={css.error}>{t(errorKey)}</div>
    if (section === 'overview') return renderOverview()
    if (section === 'ontology') return renderOntology()
    if (section === 'scenario' || section === 'knowledge') {
      if (sectionState?.loading === true) return <div className={css.empty}>{t('capabilityLoading')}</div>
      return renderCatalogGroups(sectionState?.groups ?? [])
    }
    return renderCapabilityCatalog()
  }

  const reload = () => {
    if (section === 'home') {
      void loadHome()
      void loadIdentity()
      return
    }
    if (catalogSection) {
      void loadCatalog()
      if (section === 'overview') void loadIdentity()
      return
    }
    loadedRef.current.delete(section)
    setSections(prev => ({ ...prev, [section]: undefined }))
    void loadSection(section)
  }

  return (
    <div className={css.container}>
      <aside className={css.nav}>
        <div className={css.brand}>
          <div className={css.brandTitle}>{t('workbenchTitle')}</div>
          <div className={css.brandSub}>{workbenchName ?? t('workbenchSubtitle')}</div>
        </div>
        <nav className={css.navList} aria-label={t('workbenchTitle')}>
          {NAV_GROUPS.map(group => (
            <div key={group.titleKey} className={css.navGroup}>
              <div className={css.navGroupTitle}>{t(group.titleKey)}</div>
              {group.items.map((item) => {
                const count = navCounts[item.section]
                return (
                  <button
                    key={item.section}
                    className={`${css.navItem} ${section === item.section && selected === undefined ? css.navItemActive : ''}`}
                    aria-current={section === item.section ? 'page' : undefined}
                    onClick={() => { selectSection(item.section) }}
                  >
                    <span className={css.navGlyph}>{item.glyph}</span>
                    <span className={css.navLabel}>{t(item.labelKey)}</span>
                    {count !== undefined && <span className={css.navCount}>{count}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>
      <main className={css.main}>
        <header className={css.header}>
          <div className={css.title}>
            {section === 'home' ? workbenchName ?? t(SECTION_TITLES.home) : t(SECTION_TITLES[section])}
          </div>
          <button className={css.reload} disabled={section === 'home' ? home.loading : catalogLoading} onClick={reload}>
            {home.loading || catalogLoading ? t('capabilityLoading') : t('reload')}
          </button>
        </header>
        <div className={css.body}>{renderBody()}</div>
      </main>
    </div>
  )
}
