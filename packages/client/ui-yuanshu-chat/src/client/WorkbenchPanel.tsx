import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AskKnowledgeQuestionRequest,
  YuanShuBriefingItem,
  YuanShuDecisionItem,
  YuanShuDecisionQueue,
  YuanShuHomeMetrics,
  YuanShuHomeMilestone,
  YuanShuHomeProject,
  YuanShuHomeTask,
  YuanShuHomeTaskStats,
  YuanShuSseEvent,
  YuanShuWorkbenchBriefing,
  YuanShuWorkbenchHome,
  YuanShuWorkbenchNavigator,
  YuanShuPositionCatalog,
  YuanShuWorkbenchPosition,
  YuanShuWorkbenchProfile,
  YuanShuWorkbenchRecord,
  YuanShuWorkbenchRecords,
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
  readonly getWorkbenchPosition: (position?: string) => Promise<YuanShuWorkbenchPosition>
  readonly getWorkbenchPositions: () => Promise<YuanShuPositionCatalog>
  readonly getWorkbenchBriefing: (position?: string) => Promise<YuanShuWorkbenchBriefing>
  readonly getWorkbenchDecisionQueue: (position?: string) => Promise<YuanShuDecisionQueue>
  readonly getWorkbenchNavigator: () => Promise<YuanShuWorkbenchNavigator>
  readonly listWorkbenchRecords: (
    domain: string,
    options?: { page?: number; pageSize?: number },
  ) => Promise<YuanShuWorkbenchRecords>
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

/** 左侧业务栏目导航。失败只影响业务栏目，不影响工作台与能力库入口。 */
interface NavigatorState {
  readonly loading: boolean
  readonly data?: YuanShuWorkbenchNavigator
  readonly error?: YuanShuChatKey
}

/** 当前选中业务栏目的记录。 */
interface RecordsState {
  readonly loading: boolean
  readonly data?: YuanShuWorkbenchRecords
  readonly error?: YuanShuChatKey
}

/** 岗位驾驶舱：简报与待决策队列各自独立失败，缺一个仍能渲染另一个。 */
interface CockpitState {
  readonly loading: boolean
  readonly position?: YuanShuWorkbenchPosition
  readonly catalog?: YuanShuPositionCatalog
  readonly briefing?: YuanShuWorkbenchBriefing
  readonly queue?: YuanShuDecisionQueue
  readonly error?: YuanShuChatKey
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

/** 业务栏目分组的图标，与能力库入口保持同一套字符风格。 */
const DOMAIN_GLYPHS: Readonly<Record<string, string>> = {
  project: '▦',
  procurement: '▤',
  materials: '▣',
  quality: '◎',
  masterdata: '◈',
  governance: '◇',
}

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

/** 首页指标卡文案。服务端通过 metric_keys 决定当前工作台展示哪几张、什么顺序。 */
const HOME_METRIC_LABELS: Readonly<Record<string, YuanShuChatKey>> = {
  project_total: 'metricProjectTotal',
  active_projects: 'metricActiveProjects',
  open_risks: 'metricOpenRisks',
  high_risks: 'metricHighRisks',
  open_tasks: 'metricOpenTasks',
  overdue_tasks: 'metricOverdueTasks',
  my_open_tasks: 'metricMyOpenTasks',
  my_overdue_tasks: 'metricMyOverdueTasks',
  pending_gates: 'metricPendingGates',
  milestones_due_30d: 'metricMilestonesDue30',
}

/** 服务端未下发 metric_keys 时的兜底顺序。 */
const HOME_METRIC_ORDER = [
  'project_total',
  'active_projects',
  'open_risks',
  'high_risks',
  'open_tasks',
  'overdue_tasks',
  'pending_gates',
  'milestones_due_30d',
] as const

/** 任务状态分布缺省值，兼容尚未升级的网关。 */
const EMPTY_TASK_STATS: YuanShuHomeTaskStats = {
  total: 0,
  pending: 0,
  in_progress: 0,
  overdue: 0,
  completed: 0,
  cancelled: 0,
}

const PRIORITY_LABELS: Readonly<Record<string, YuanShuChatKey>> = {
  urgent: 'priorityUrgent',
  high: 'priorityHigh',
  medium: 'priorityMedium',
  low: 'priorityLow',
}

const PROGRESS_COLORS = ['#4f7cff', '#8b5cf6', '#2ecc8f', '#f5a623'] as const
const TIMELINE_COLORS = ['#4f7cff', '#8b5cf6', '#2ecc8f', '#f5a623'] as const

function priorityKey(value: string): YuanShuChatKey {
  return PRIORITY_LABELS[value] ?? 'priorityLow'
}

function priorityClass(value: string): string {
  switch (value) {
    case 'urgent': return css.priorityUrgent ?? ''
    case 'high': return css.priorityHigh ?? ''
    case 'medium': return css.priorityMedium ?? ''
    default: return css.priorityLow ?? ''
  }
}

/** 头像占位取负责人姓名首字，没有负责人时用中性符号。 */
function initialOf(name: string | undefined): string {
  const trimmed = name?.trim() ?? ''
  return trimmed.length > 0 ? trimmed.slice(0, 1) : '·'
}

/** 任务时间：今天/明天用相对文案，其余用本地月日；零点不显示时间。 */
function taskTime(
  value: string | null | undefined,
  t: (key: YuanShuChatKey) => string,
): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return dateLabel(value)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startOfDay.getTime() - startOfToday.getTime()) / 86_400_000)
  const day = diffDays === 0
    ? t('today')
    : diffDays === 1
      ? t('tomorrow')
      : date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
  const hasClock = date.getHours() !== 0 || date.getMinutes() !== 0
  const clock = hasClock
    ? ` ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    : ''
  return `${day}${clock}`
}

function greetingKey(): YuanShuChatKey {
  const hour = new Date().getHours()
  if (hour < 12) return 'greetingMorning'
  if (hour < 18) return 'greetingAfternoon'
  return 'greetingEvening'
}

function StatIcon({ kind }: { readonly kind: 'tasks' | 'check' | 'clock' | 'flag' }): React.JSX.Element {
  const paths = {
    tasks: <><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 9h6M9 13h6" /></>,
    check: <><circle cx="12" cy="12" r="8" /><path d="M8.5 12.2l2.4 2.4 4.6-4.8" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l2.8 1.6" /></>,
    flag: <><path d="M6 4v16" /><path d="M6 5h10l-2 3.5L16 12H6" /></>,
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[kind]}
    </svg>
  )
}

/** 项目执行类工作台带 projects / my_tasks，使用仪表盘布局；其余岗位沿用分区列表。 */
function isDashboardSections(sections: readonly string[]): boolean {
  return sections.includes('projects') || sections.includes('my_tasks')
}

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
  getWorkbenchPosition,
  getWorkbenchPositions,
  getWorkbenchBriefing,
  getWorkbenchDecisionQueue,
  getWorkbenchNavigator,
  listWorkbenchRecords,
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
  // 左侧业务栏目由元枢下发，客户端不硬编码业务域。
  const [navigator, setNavigator] = useState<NavigatorState>({ loading: true })
  // 选中业务栏目时，正文切换为该栏目的跨项目记录。
  const [domain, setDomain] = useState<string>()
  const [records, setRecords] = useState<RecordsState>({ loading: false })
  // 选中行按 "domain:id" 记录；切换栏目后旧 key 不再命中，自动回落到首条。
  const [activeRecordKey, setActiveRecordKey] = useState<string>()
  // 岗位驾驶舱是默认视图，原有经营看板降级为可切换的次要视图。
  const [cockpit, setCockpit] = useState<CockpitState>({ loading: true })
  const [positionCode, setPositionCode] = useState<string | undefined>(undefined)
  const [homeView, setHomeView] = useState<'cockpit' | 'dashboard'>('cockpit')
  // 首页搜索只过滤当前已加载的首页任务，不额外请求服务端。
  const [query, setQuery] = useState('')
  const boardRef = useRef<HTMLElement>(null)

  const loadedRef = useRef(new Set<WorkbenchSection>())
  const loadingRef = useRef(new Set<WorkbenchSection>())
  const catalogLoadedRef = useRef(false)
  const identityLoadedRef = useRef(false)
  const homeLoadedRef = useRef(false)
  const cockpitLoadedRef = useRef(false)
  const navigatorLoadedRef = useRef(false)

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

  // 业务栏目导航独立失败：工作台与能力库仍可用，只在左侧提示栏目加载失败。
  const loadNavigator = useCallback(async () => {
    setNavigator(prev => ({
      loading: true,
      ...(prev.data === undefined ? {} : { data: prev.data }),
    }))
    try {
      setNavigator({ loading: false, data: await getWorkbenchNavigator() })
    } catch (err) {
      setNavigator({ loading: false, error: failureKey(err) })
    }
  }, [getWorkbenchNavigator])

  // 栏目记录一次取足够展示的首页数据；切换栏目即整体替换，避免串域。
  const loadRecords = useCallback(async (target: string) => {
    setRecords({ loading: true })
    try {
      setRecords({
        loading: false,
        data: await listWorkbenchRecords(target, { page: 1, pageSize: 100 }),
      })
    } catch (err) {
      setRecords({ loading: false, error: failureKey(err) })
    }
  }, [listWorkbenchRecords])

  // 岗位驾驶舱：简报、决策队列与岗位目录各自独立，任一失败不影响其他区块。
  const loadCockpit = useCallback(async (position?: string) => {
    setCockpit(prev => ({ ...prev, loading: true }))
    const [positionResult, catalogResult, briefingResult, queueResult] = await Promise.allSettled([
      getWorkbenchPosition(position),
      getWorkbenchPositions(),
      getWorkbenchBriefing(position),
      getWorkbenchDecisionQueue(position),
    ])
    setCockpit({
      loading: false,
      ...(positionResult.status === 'fulfilled' ? { position: positionResult.value } : {}),
      ...(catalogResult.status === 'fulfilled' ? { catalog: catalogResult.value } : {}),
      ...(briefingResult.status === 'fulfilled' ? { briefing: briefingResult.value } : {}),
      ...(queueResult.status === 'fulfilled' ? { queue: queueResult.value } : {}),
      ...(briefingResult.status === 'rejected' && queueResult.status === 'rejected'
        ? { error: failureKey(briefingResult.reason) }
        : {}),
    })
  }, [getWorkbenchPosition, getWorkbenchPositions, getWorkbenchBriefing, getWorkbenchDecisionQueue])

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

  useEffect(() => {
    if (!identityReady || cockpitLoadedRef.current) return
    cockpitLoadedRef.current = true
    void loadCockpit(positionCode)
  }, [identityReady, loadCockpit, positionCode])

  useEffect(() => {
    if (!identityReady || navigatorLoadedRef.current) return
    navigatorLoadedRef.current = true
    void loadNavigator()
  }, [identityReady, loadNavigator])

  useEffect(() => {
    if (domain === undefined) return
    void loadRecords(domain)
  }, [domain, loadRecords])

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
    setDomain(undefined)
    setSection(next)
  }, [])

  const selectDomain = useCallback((next: string) => {
    setSelected(undefined)
    setActiveRecordKey(undefined)
    setDomain(next)
  }, [])

  // 驾驶舱与简报里的每条事项都能落到具体记录，保留"查证据"的能力。
  const openRecord = useCallback((targetDomain: string, recordId: number) => {
    setSelected(undefined)
    setActiveRecordKey(`${targetDomain}:${recordId}`)
    setDomain(targetDomain)
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
    setDomain(undefined)
    setActiveRecordKey(undefined)
    setRecords({ loading: false })
    setCockpit({ loading: true })
    setPositionCode(undefined)
    setHomeView('cockpit')
    navigatorLoadedRef.current = true
    cockpitLoadedRef.current = true
    void loadCatalog()
    void loadIdentity()
    void loadHome()
    void loadCockpit()
    void loadNavigator()
    void loadSection('scenario')
    void loadSection('knowledge')
  }, [loadCatalog, loadIdentity, loadHome, loadCockpit, loadNavigator, loadSection])

  const sectionCapabilities = useMemo(() => {
    return capabilities.filter(capability => CAPABILITY_SECTION[capability.kind] === section)
  }, [capabilities, section])

  const sectionState = sections[section]
  const catalogSection = section === 'overview' || section === 'skill' || section === 'algorithm' || section === 'dag'
  const errorKey = sectionState?.error ?? (catalogSection ? catalogError : undefined)

  // 当前业务栏目的标题来自元枢下发，客户端不维护一份并列的业务域枚举。
  const domainMeta = useMemo(() => {
    if (domain === undefined || navigator.data === undefined) return undefined
    for (const group of navigator.data.groups) {
      const item = group.items.find(candidate => candidate.code === domain)
      if (item !== undefined) return { title: item.title, group: group.title }
    }
    return undefined
  }, [domain, navigator.data])

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

  const renderMetrics = (metrics: YuanShuHomeMetrics, metricKeys?: readonly string[]) => {
    const keys = metricKeys !== undefined && metricKeys.length > 0 ? metricKeys : HOME_METRIC_ORDER
    return (
      <div className={css.metricGrid}>
        {keys.map((key) => {
          const labelKey = HOME_METRIC_LABELS[key]
          if (labelKey === undefined) return null
          return (
            <div key={key} className={css.metricCard}>
              <span className={css.metricValue}>{metrics[key as keyof YuanShuHomeMetrics]}</span>
              <span className={css.metricLabel}>{t(labelKey)}</span>
            </div>
          )
        })}
      </div>
    )
  }

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

  const renderProjectSection = (value: YuanShuWorkbenchHome) => {
    if (value.projects.length === 0) return renderHomeBlock('homeProjects', <div className={css.empty}>{t('sectionEmpty')}</div>, 0)
    return renderHomeBlock('homeProjects', (
      <ul className={css.list}>
        {value.projects.map((project) => {
          const endDate = dateLabel(project.end_date)
          const progress = Math.max(0, Math.min(100, Math.round(project.progress_percent)))
          const risky = project.risk_level === 'critical' || project.risk_level === 'high'
          return (
            <li key={project.id} className={css.row}>
              <div className={css.rowHead}>
                <span className={css.rowName}>{project.name}</span>
                <span className={`${css.badge} ${risky ? css.badgeDanger : ''}`}>{project.risk_level}</span>
              </div>
              <div className={css.rowDesc}>
                {project.code} · {project.stage} · {project.status}
                {project.manager_name !== undefined && project.manager_name.length > 0 ? ` · ${project.manager_name}` : ''}
              </div>
              <div className={css.progressTrack}>
                <div className={css.progressFill} style={{ width: `${progress}%` }} />
              </div>
              <div className={css.rowMeta}>
                <span>{t('progressLabel')} {progress}%</span>
                <span>{t('openTasksCount')} {project.open_tasks}</span>
                <span>{t('openRisksCount')} {project.open_risks}</span>
                {endDate !== undefined && <span>{t('planEnd')} {endDate}</span>}
              </div>
            </li>
          )
        })}
      </ul>
    ), value.projects.length)
  }

  const renderTaskList = (items: readonly YuanShuHomeTask[], titleKey: YuanShuChatKey) => {
    if (items.length === 0) return renderHomeBlock(titleKey, <div className={css.empty}>{t('sectionEmpty')}</div>, 0)
    return renderHomeBlock(titleKey, (
      <ul className={css.list}>
        {items.map((task) => {
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
    ), items.length)
  }

  const renderTaskSection = (value: YuanShuWorkbenchHome) => renderTaskList(value.tasks, 'homeTasks')

  const renderMyTaskSection = (value: YuanShuWorkbenchHome) => renderTaskList(value.my_tasks, 'homeMyTasks')

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
        return <div key={code} className={css.homeBlock}>{renderMetrics(value.metrics, value.metric_keys)}</div>
      case 'projects':
        return <div key={code}>{renderProjectSection(value)}</div>
      case 'risks':
        return <div key={code}>{renderRiskSection(value)}</div>
      case 'tasks':
        return <div key={code}>{renderTaskSection(value)}</div>
      case 'my_tasks':
        return <div key={code}>{renderMyTaskSection(value)}</div>
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

  const scrollToBoard = () => {
    boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** 首页搜索只做本地过滤，匹配任务名、项目、编号与负责人。 */
  const filteredTasks = (items: readonly YuanShuHomeTask[]): readonly YuanShuHomeTask[] => {
    const keyword = query.trim().toLowerCase()
    if (keyword.length === 0) return items
    return items.filter(task => [task.name, task.project_name, task.code, task.owner_name ?? '']
      .some(value => value.toLowerCase().includes(keyword)))
  }

  const renderStatCards = (stats: YuanShuHomeTaskStats, metrics: YuanShuHomeMetrics) => {
    const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
    const cards = [
      {
        key: 'mine', tone: css.metricBlue, icon: 'tasks' as const, iconTone: css.iconBlue,
        label: 'statMyTasks' as const, value: stats.total,
        sub: t('statInProgressCount', { count: stats.in_progress }), danger: false,
      },
      {
        key: 'done', tone: css.metricGreen, icon: 'check' as const, iconTone: css.iconGreen,
        label: 'statCompleted' as const, value: stats.completed,
        sub: t('statCompletionRate', { percent: completionRate }), danger: false,
      },
      {
        key: 'pending', tone: css.metricOrange, icon: 'clock' as const, iconTone: css.iconOrange,
        label: 'statPending' as const, value: stats.pending,
        sub: t('statOverdueHint', { count: stats.overdue }), danger: stats.overdue > 0,
      },
      {
        key: 'projects', tone: css.metricPurple, icon: 'flag' as const, iconTone: css.iconPurple,
        label: 'statProjects' as const, value: metrics.project_total,
        sub: t('statInProgressCount', { count: metrics.active_projects }), danger: false,
      },
    ]
    return (
      <div className={css.dashMetricGrid}>
        {cards.map(card => (
          <div key={card.key} className={`${css.dashMetric} ${card.tone}`}>
            <span className={`${css.metricIcon} ${card.iconTone}`}><StatIcon kind={card.icon} /></span>
            <div className={css.metricBody}>
              <span className={css.metricLabel}>{t(card.label)}</span>
              <span className={css.metricNumber}>
                {card.value}
                <span className={css.metricUnit}>{t('unitCount')}</span>
              </span>
              <span className={`${css.metricSub} ${card.danger ? css.metricSubDanger : ''}`}>{card.sub}</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderDonut = (stats: YuanShuHomeTaskStats) => {
    const total = stats.total
    const radius = 52
    const circumference = 2 * Math.PI * radius
    const slices = [
      { key: 'in_progress', labelKey: 'taskStatusInProgress' as const, value: stats.in_progress, color: '#4f7cff' },
      { key: 'completed', labelKey: 'taskStatusCompleted' as const, value: stats.completed, color: '#2ecc8f' },
      { key: 'pending', labelKey: 'taskStatusPending' as const, value: stats.pending, color: '#f5a623' },
      { key: 'overdue', labelKey: 'taskStatusOverdue' as const, value: stats.overdue, color: '#f5556b' },
      { key: 'cancelled', labelKey: 'taskStatusCancelled' as const, value: stats.cancelled, color: '#8b95a8' },
    ]
    let offset = 0
    return (
      <section className={css.dashPanel}>
        <header className={css.panelHead}>
          <span className={css.panelTitle}>{t('taskOverview')}</span>
          <span className={css.panelHint}>{t('thisWeek')} ⌄</span>
        </header>
        <div className={css.donutWrap}>
          <svg className={css.donut} width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={t('taskOverview')}>
            <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
            {total > 0 && slices.map((slice) => {
              const length = (slice.value / total) * circumference
              const element = (
                <circle
                  key={slice.key}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="14"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 70 70)"
                />
              )
              offset += length
              return element
            })}
            <text x="70" y="66" textAnchor="middle" className={css.donutCenter}>{total}</text>
            <text x="70" y="83" textAnchor="middle" className={css.donutCenterLabel}>{t('taskTotal')}</text>
          </svg>
          <ul className={css.legend}>
            {slices.map(slice => (
              <li key={slice.key} className={css.legendRow}>
                <span className={css.legendDot} style={{ background: slice.color }} />
                <span className={css.legendLabel}>{t(slice.labelKey)}</span>
                <span className={css.legendValue}>{slice.value}</span>
                <span className={css.legendPct}>{total > 0 ? Math.round((slice.value / total) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    )
  }

  const renderRecentTasks = (items: readonly YuanShuHomeTask[]) => {
    const rows = filteredTasks(items).slice(0, 6)
    return (
      <section className={css.dashPanel}>
        <header className={css.panelHead}>
          <span className={css.panelTitle}>{t('recentDueTasks')}</span>
          <button className={css.panelLink} onClick={scrollToBoard}>{t('viewAll')} ›</button>
        </header>
        {rows.length === 0
          ? <div className={css.dashEmpty}>{t('sectionEmpty')}</div>
          : (
            <ul className={css.dueList}>
              {rows.map(task => (
                <li key={task.id} className={css.dueRow}>
                  <span className={`${css.priority} ${priorityClass(task.priority)}`}>{t(priorityKey(task.priority))}</span>
                  <span className={css.dueName} title={task.name}>{task.name}</span>
                  <span className={css.dueTime}>{taskTime(task.plan_end, t) ?? task.code}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    )
  }

  const renderBoardCard = (task: YuanShuHomeTask) => (
    <article key={task.id} className={css.boardCard}>
      <div className={css.boardCardTop}>
        <span className={css.boardCardName} title={task.name}>{task.name}</span>
        <span className={css.boardCardAvatar} aria-hidden="true">{initialOf(task.owner_name)}</span>
      </div>
      <div className={css.boardCardMeta}>
        <span className={`${css.priority} ${priorityClass(task.priority)}`}>{t(priorityKey(task.priority))}</span>
        <span>{taskTime(task.plan_end, t) ?? task.project_name}</span>
      </div>
    </article>
  )

  const renderBoard = (items: readonly YuanShuHomeTask[], stats: YuanShuHomeTaskStats) => {
    const scoped = filteredTasks(items)
    const open = scoped.filter(task => !task.overdue)
    const columns = [
      {
        key: 'pending', labelKey: 'taskStatusPending' as const, dot: css.dotBlue,
        items: open.filter(task => task.status === 'pending'), count: stats.pending,
      },
      {
        key: 'in_progress', labelKey: 'taskStatusInProgress' as const, dot: css.dotPurple,
        items: open.filter(task => task.status !== 'pending'), count: stats.in_progress,
      },
      {
        key: 'completed', labelKey: 'taskStatusCompleted' as const, dot: css.dotGreen,
        items: [] as readonly YuanShuHomeTask[], count: stats.completed,
      },
      {
        key: 'overdue', labelKey: 'taskStatusOverdue' as const, dot: css.dotRed,
        items: scoped.filter(task => task.overdue), count: stats.overdue,
      },
    ]
    return (
      <section className={css.boardSection} ref={boardRef}>
        <header className={css.panelHead}>
          <span className={css.panelTitle}>{t('taskBoard')}</span>
          <span className={css.panelHint}>{t('boardHint')} ⌄</span>
        </header>
        <div className={css.boardGrid}>
          {columns.map(column => (
            <div key={column.key} className={css.boardColumn}>
              <div className={css.columnHead}>
                <span className={`${css.columnDot} ${column.dot}`} />
                <span>{t(column.labelKey)}</span>
                <span className={css.columnCount}>{column.count}</span>
              </div>
              {column.items.length > 0
                ? column.items.slice(0, 6).map(renderBoardCard)
                : (
                  <div className={css.boardEmpty}>
                    {column.key === 'completed' && column.count > 0
                      ? t('kanbanCompletedHint')
                      : t('kanbanEmpty')}
                  </div>
                )}
            </div>
          ))}
        </div>
      </section>
    )
  }

  const renderTodoCard = (items: readonly YuanShuHomeTask[]) => {
    const rows = filteredTasks(items).slice(0, 5)
    return (
      <section className={css.dashPanel}>
        <header className={css.panelHead}>
          <span className={css.panelTitle}>{t('todayTasks')}</span>
          <span className={css.panelHint}>{rows.length}</span>
        </header>
        {rows.length === 0
          ? <div className={css.dashEmpty}>{t('sectionEmpty')}</div>
          : (
            <div className={css.todoList}>
              {rows.map(task => (
                <div key={task.id} className={css.todoRow}>
                  <span className={css.todoBox} aria-hidden="true" />
                  <span className={css.todoName} title={task.name}>{task.name}</span>
                  <span className={`${css.priority} ${priorityClass(task.priority)}`}>{t(priorityKey(task.priority))}</span>
                  <span className={css.todoTime}>{taskTime(task.plan_end, t) ?? task.code}</span>
                </div>
              ))}
            </div>
          )}
      </section>
    )
  }

  const renderProgressCard = (projects: readonly YuanShuHomeProject[]) => {
    const rows = projects.slice(0, 4)
    return (
      <section className={css.dashPanel}>
        <header className={css.panelHead}>
          <span className={css.panelTitle}>{t('projectProgress')}</span>
          <span className={css.panelHint}>{projects.length}</span>
        </header>
        {rows.length === 0
          ? <div className={css.dashEmpty}>{t('sectionEmpty')}</div>
          : (
            <div className={css.progressList}>
              {rows.map((project, index) => {
                const progress = Math.max(0, Math.min(100, Math.round(project.progress_percent)))
                return (
                  <div key={project.id} className={css.progressRow}>
                    <div className={css.progressHead}>
                      <span className={css.progressName} title={project.name}>{project.name}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className={css.dashProgressTrack}>
                      <div
                        className={css.dashProgressFill}
                        style={{ width: `${progress}%`, background: PROGRESS_COLORS[index % PROGRESS_COLORS.length] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
      </section>
    )
  }

  const renderScheduleCard = (milestones: readonly YuanShuHomeMilestone[]) => {
    const rows = milestones.slice(0, 4)
    return (
      <section className={css.dashPanel}>
        <header className={css.panelHead}>
          <span className={css.panelTitle}>{t('mySchedule')}</span>
          <span className={css.panelHint}>{milestones.length}</span>
        </header>
        {rows.length === 0
          ? <div className={css.dashEmpty}>{t('sectionEmpty')}</div>
          : (
            <div className={css.timeline}>
              {rows.map((milestone, index) => (
                <div key={milestone.id} className={css.timelineRow}>
                  <span
                    className={css.timelineDot}
                    style={{ background: TIMELINE_COLORS[index % TIMELINE_COLORS.length] }}
                  />
                  <div className={css.timelineBody}>
                    <div className={css.timelineName}>{milestone.name}</div>
                    <div className={css.timelineMeta}>
                      {dateLabel(milestone.plan_date) ?? milestone.code}
                      {' · '}{milestone.project_name}
                      {' · '}{t('daysLeft')} {milestone.days_left}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </section>
    )
  }

  const renderDashRisk = (value: YuanShuWorkbenchHome) => (
    <section className={css.dashPanel}>
      <header className={css.panelHead}>
        <span className={css.panelTitle}>{t('homeRisks')}</span>
        <span className={css.panelHint}>{value.risks.length}</span>
      </header>
      {value.risks.length === 0
        ? <div className={css.dashEmpty}>{t('sectionEmpty')}</div>
        : (
          <ul className={css.dashList}>
            {value.risks.map((risk) => {
              const deadline = dateLabel(risk.deadline)
              return (
                <li key={risk.id} className={css.dashRow}>
                  <div className={css.dashRowHead}>
                    <span className={css.dashRowName}>{risk.title}</span>
                    <span className={`${css.dashBadge} ${risk.risk_level === 'critical' || risk.risk_level === 'high' ? css.dashBadgeDanger : ''}`}>
                      {risk.risk_level}
                    </span>
                  </div>
                  <div className={css.dashRowDesc}>
                    {risk.project_name} · {risk.risk_code} · {risk.status}
                    {risk.handler_name !== undefined && risk.handler_name.length > 0 ? ` · ${risk.handler_name}` : ''}
                  </div>
                  {deadline !== undefined && <div className={css.dashRowMeta}>{t('deadline')} {deadline}</div>}
                </li>
              )
            })}
          </ul>
        )}
    </section>
  )

  const renderDashGate = (value: YuanShuWorkbenchHome) => (
    <section className={css.dashPanel}>
      <header className={css.panelHead}>
        <span className={css.panelTitle}>{t('homeGates')}</span>
        <span className={css.panelHint}>{value.gates.length}</span>
      </header>
      {value.gates.length === 0
        ? <div className={css.dashEmpty}>{t('sectionEmpty')}</div>
        : (
          <ul className={css.dashList}>
            {value.gates.map((gate) => {
              const planned = dateLabel(gate.planned_date)
              return (
                <li key={gate.id} className={css.dashRow}>
                  <div className={css.dashRowHead}>
                    <span className={css.dashRowName}>{gate.gate_name}</span>
                    <span className={css.dashBadge}>{gate.gate_status}</span>
                  </div>
                  <div className={css.dashRowDesc}>{gate.project_name} · {gate.gate_code}</div>
                  {planned !== undefined && <div className={css.dashRowMeta}>{t('plannedDate')} {planned}</div>}
                </li>
              )
            })}
          </ul>
        )}
    </section>
  )

  const renderDashScenes = (value: YuanShuWorkbenchHome) => (
    <section className={`${css.dashPanel} ${css.auxWide}`}>
      <header className={css.panelHead}>
        <span className={css.panelTitle}>{t('homeScenes')}</span>
        <span className={css.panelHint}>{value.scenes.length}</span>
      </header>
      {value.scenes.length === 0
        ? <div className={css.dashEmpty}>{t('sectionEmpty')}</div>
        : (
          <div className={css.dashSceneGrid}>
            {value.scenes.map(scene => (
              <div key={scene.code} className={css.dashRow}>
                <div className={css.dashRowHead}>
                  <span className={css.dashRowName}>{scene.title}</span>
                  <span className={`${css.dashBadge} ${scene.available ? '' : css.dashBadgeMuted}`}>
                    {scene.available ? t('sceneAvailable') : t('sceneUnavailable')}
                  </span>
                </div>
                <div className={css.dashRowDesc}>{scene.description}</div>
                <div className={css.dashRowMeta}>{scene.plugin_id}{scene.entry.length > 0 ? ` · ${scene.entry}` : ''}</div>
              </div>
            ))}
          </div>
        )}
    </section>
  )

  const renderDashboard = (value: YuanShuWorkbenchHome) => {
    const stats = value.my_task_stats ?? EMPTY_TASK_STATS
    const affiliation = [home.profile?.department.name, value.tenant.name].filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    ).join(' · ')
    const boardSource = value.my_tasks.length > 0 ? value.my_tasks : value.tasks
    return (
      <>
        {home.profileError !== undefined && (
          <div className={css.notice}>{t('profileFallback')}</div>
        )}
        <section className={css.dashHero}>
          <div className={css.dashHeroMain}>
            <div className={css.heroGreeting}>{t('heroGreetingTitle', { greeting: t(greetingKey()) })}</div>
            <div className={css.heroSubtitle}>{t('heroSubtitle')}</div>
            <div className={css.dashHeroMeta}>
              <span>{accountName}</span>
              {affiliation.length > 0 && <span>{affiliation}</span>}
              {activeRoles.map(role => <span key={role.code} className={css.chipRole}>{role.name}</span>)}
            </div>
          </div>
          <div className={css.dashHeroSide}>
            <button className={css.heroCta} onClick={scrollToBoard}>{t('heroCta')}</button>
            {dataScope !== undefined && dataScope.length > 0 && (
              <div className={css.heroScope}>{t('dataScope')}：{dataScope}</div>
            )}
          </div>
        </section>
        {renderStatCards(stats, value.metrics)}
        <div className={css.dashColumns}>
          {renderDonut(stats)}
          {renderRecentTasks(value.tasks)}
        </div>
        {renderBoard(boardSource, stats)}
        <div className={css.bottomGrid}>
          {(value.sections.includes('my_tasks') || value.sections.includes('tasks')) && renderTodoCard(boardSource)}
          {value.sections.includes('projects') && renderProgressCard(value.projects)}
          {value.sections.includes('milestones') && renderScheduleCard(value.milestones)}
        </div>
        {(value.sections.includes('risks') || value.sections.includes('gates') || value.sections.includes('scenes')) && (
          <div className={css.auxGrid}>
            {value.sections.includes('risks') && renderDashRisk(value)}
            {value.sections.includes('gates') && renderDashGate(value)}
            {value.sections.includes('scenes') && renderDashScenes(value)}
          </div>
        )}
      </>
    )
  }

  // 原经营看板保留为次要视图：驾驶舱负责"今天做什么"，看板负责"整体怎么样"。
  // 后端空切片会序列化成 null，这里统一兜底，避免任一集合为 null 时整块看板白屏。
  const normalizeHome = (value: YuanShuWorkbenchHome): YuanShuWorkbenchHome => ({
    ...value,
    sections: value.sections ?? [],
    projects: value.projects ?? [],
    risks: value.risks ?? [],
    tasks: value.tasks ?? [],
    my_tasks: value.my_tasks ?? [],
    gates: value.gates ?? [],
    milestones: value.milestones ?? [],
    scenes: value.scenes ?? [],
    metric_keys: value.metric_keys ?? [],
  })

  const renderDashboardHome = () => {
    if (home.loading && home.home === undefined) return <div className={css.empty}>{t('homeLoading')}</div>
    if (home.home === undefined) return <div className={css.error}>{t(home.homeError ?? 'homeFailed')}</div>
    const value = normalizeHome(home.home)
    if (isDashboardSections(value.sections)) return renderDashboard(value)
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
            {dataScope !== undefined && dataScope.length > 0 && (
              <div className={css.scope}>{t('dataScope')}：{dataScope}</div>
            )}
          </div>
        </div>
        {order.map(code => renderHomeSection(code, value))}
      </>
    )
  }

  const renderHomeSwitch = () => (
    <div className={css.homeToolbar}>
      <div className={css.viewSwitch}>
        <button
          type="button"
          className={`${css.viewSwitchButton} ${homeView === 'cockpit' ? css.viewSwitchActive : ''}`}
          onClick={() => { setHomeView('cockpit') }}
        >
          {t('homeViewCockpit')}
        </button>
        <button
          type="button"
          className={`${css.viewSwitchButton} ${homeView === 'dashboard' ? css.viewSwitchActive : ''}`}
          onClick={() => { setHomeView('dashboard') }}
        >
          {t('homeViewDashboard')}
        </button>
      </div>
    </div>
  )

  const renderBriefingBlock = (titleKey: YuanShuChatKey, items: readonly YuanShuBriefingItem[]) => (
    <div className={css.briefCard}>
      <div className={css.groupTitle}>{t(titleKey)} · {items.length}</div>
      {items.length === 0
        ? <div className={css.empty}>{t('sectionEmpty')}</div>
        : (
          <ul className={css.list}>
            {items.map(item => (
              <li
                key={item.id}
                className={css.briefItem}
                role="button"
                tabIndex={0}
                onClick={() => { openRecord(item.domain, item.record_id) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openRecord(item.domain, item.record_id)
                  }
                }}
              >
                <div className={css.briefItemTitle}>{item.title}</div>
                <div className={css.briefItemMeta}>
                  {[item.meta, item.due_date].filter(value => value.length > 0).join(' · ')}
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  )

  const renderDecisionCard = (item: YuanShuDecisionItem) => (
    <li key={item.id} className={`${css.decisionCard} ${item.severity === 'high' ? css.decisionCardHigh : ''}`}>
      <div className={css.decisionTop}>
        <span className={`${css.severityTag} ${item.severity === 'high' ? css.severityHigh : css.severityNormal}`}>
          {t(item.severity === 'high' ? 'severityHigh' : item.severity === 'medium' ? 'severityMedium' : 'severityLow')}
        </span>
        <span className={css.decisionTitle}>{item.title}</span>
      </div>
      <div className={css.decisionReason}>{item.reason}</div>
      <div className={css.decisionRec}>
        <span className={css.decisionLabel}>{t('cockpitRecommend')}</span>
        {item.recommendation}
      </div>
      {item.evidence.length > 0 && (
        <div className={css.evidenceRow}>
          {item.evidence.map(entry => (
            <span key={`${item.id}:${entry.label}`} className={css.evidenceChip}>
              {entry.label} {entry.value}
            </span>
          ))}
        </div>
      )}
      <div className={css.decisionFoot}>
        <div className={css.actionRow}>
          {item.actions.map(action => <span key={action.code} className={css.actionTag}>{action.label}</span>)}
        </div>
        <button
          type="button"
          className={css.linkButton}
          onClick={() => { openRecord(item.domain, item.record_id) }}
        >
          {t('cockpitView')}
        </button>
      </div>
    </li>
  )

  // 岗位驾驶舱：先回答"今天要做什么"，再给证据，最后才允许钻取到表格。
  const renderCockpit = () => {
    const position = cockpit.position
    const briefing = cockpit.briefing
    const queue = cockpit.queue
    if (cockpit.loading && briefing === undefined && queue === undefined) {
      return <div className={css.empty}>{t('homeLoading')}</div>
    }
    if (cockpit.error !== undefined) return <div className={css.error}>{t(cockpit.error)}</div>
    const items = queue?.items ?? []
    const kpis = briefing?.kpis ?? []
    const workflows = position?.workflows ?? []
    const catalog = cockpit.catalog
    const canPreview = position !== undefined && (position.scope.type === 'tenant' || position.scope.type === 'all')
    const heroMeta = [
      position?.title ?? briefing?.workbench?.title ?? workbenchName,
      accountName,
      briefing?.tenant?.name,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0).join(' · ')
    return (
      <>
        <div className={css.hero}>
          <div className={css.heroMain}>
            <div className={css.heroTitle}>{briefing?.greeting ?? t('cockpitTitle')}</div>
            <div className={css.heroQuestion}>{position?.headline ?? t('cockpitQuestion')}</div>
            {heroMeta.length > 0 && <div className={css.heroMeta}>{heroMeta}</div>}
          </div>
          <div className={css.heroSide}>
            {briefing?.data_scope?.description !== undefined && (
              <div className={css.scope}>{t('dataScope')}：{briefing.data_scope.description}</div>
            )}
            {position !== undefined && position.blocks.length > 0 && (
              <div className={css.positionFocus}>
                {t('cockpitFocus')}：{position.blocks.map(block => block.title).join(' / ')}
              </div>
            )}
          </div>
        </div>
        {kpis.length > 0 && (
          <div className={css.kpiGrid}>
            {kpis.map(kpi => (
              <div key={kpi.key} className={css.kpiCard}>
                <div className={`${css.kpiValue} ${kpi.tone === 'danger' ? css.kpiDanger : kpi.tone === 'warning' ? css.kpiWarning : ''}`}>
                  {kpi.value}
                </div>
                <div className={css.kpiLabel}>{kpi.label}</div>
              </div>
            ))}
          </div>
        )}
        {workflows.length > 0 && (
          <div className={css.playbookRow}>
            <span className={css.playbookLabel}>{t('cockpitPlaybooks')}</span>
            {workflows.map(workflow => (
              <span
                key={workflow.code}
                className={css.playbookChip}
                title={`${workflow.intent} → ${workflow.deliverable}`}
              >
                {workflow.label}
                {workflow.approval === 'required' && <span className={css.workflowGate}>{t('cockpitApproval')}</span>}
              </span>
            ))}
          </div>
        )}
        {canPreview && catalog !== undefined && catalog.options.length > 1 && (
          <div className={css.positionSwitch}>
            <span className={css.positionSwitchLabel}>{t('cockpitPreview')}</span>
            {catalog.options.map(option => (
              <button
                key={option.code}
                type="button"
                className={`${css.positionChip} ${position?.position === option.code ? css.positionChipActive : ''}`}
                onClick={() => {
                  setPositionCode(option.code)
                  void loadCockpit(option.code)
                }}
              >
                {option.title}
              </button>
            ))}
          </div>
        )}
        <div className={css.cockpitColumns}>
          <section className={css.cockpitMain}>
            <div className={css.groupTitle}>{t('cockpitDecisions')} · {items.length}</div>
            {items.length === 0
              ? <div className={css.empty}>{t('cockpitNoDecision')}</div>
              : <ul className={css.decisionList}>{items.map(renderDecisionCard)}</ul>}
          </section>
          <aside className={css.cockpitSide}>
            {renderBriefingBlock('cockpitToday', briefing?.today ?? [])}
            {renderBriefingBlock('cockpitExceptions', briefing?.exceptions ?? [])}
          </aside>
        </div>
      </>
    )
  }

  const renderHome = () => (
    <>
      {renderHomeSwitch()}
      {homeView === 'cockpit' ? renderCockpit() : renderDashboardHome()}
    </>
  )

  // 业务栏目正文：左侧表格保留跨域可比列，右侧详情展示该域自己的字段。
  const recordItems = records.data?.items
  const activeRecord = useMemo(() => {
    const items = recordItems ?? []
    if (items.length === 0) return undefined
    return items.find(item => `${item.domain}:${item.id}` === activeRecordKey) ?? items[0]
  }, [recordItems, activeRecordKey])

  const recordTitle = (row: YuanShuWorkbenchRecord): string => (row.title.length > 0 ? row.title : row.code)

  const cellText = (value: string | undefined): string => (value !== undefined && value.length > 0 ? value : '—')

  const renderDomainTable = (items: readonly YuanShuWorkbenchRecord[]) => (
    <div className={css.tableWrap}>
      <table className={css.table}>
        <thead>
          <tr>
            <th>{t('recordsName')}</th>
            <th>{t('recordsStatus')}</th>
            <th>{t('recordsPriority')}</th>
            <th>{t('recordsOwner')}</th>
            <th>{t('recordsProject')}</th>
            <th>{t('deadline')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const key = `${row.domain}:${row.id}`
            const active = key === `${activeRecord?.domain}:${activeRecord?.id}`
            return (
              <tr
                key={key}
                className={`${css.tableRow} ${active ? css.tableRowActive : ''}`}
                aria-selected={active}
                onClick={() => { setActiveRecordKey(key) }}
              >
                <td>
                  <div className={css.cellName}>{recordTitle(row)}</div>
                  {row.code.length > 0 && row.code !== recordTitle(row) && (
                    <div className={css.cellSub}>{row.code}</div>
                  )}
                </td>
                <td>{row.status.length > 0 ? <span className={css.badge}>{row.status}</span> : '—'}</td>
                <td>{cellText(row.priority)}</td>
                <td>{cellText(row.owner_name)}</td>
                <td>{cellText(row.project_name)}</td>
                <td>
                  <span className={row.overdue ? css.cellOverdue : undefined}>{cellText(row.due_date)}</span>
                  {row.overdue && <span className={`${css.badge} ${css.badgeDanger}`}>{t('overdue')}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const renderRecordDetail = () => {
    if (activeRecord === undefined) {
      return <aside className={css.detailPanel}><div className={css.detailEmpty}>{t('recordsDetailEmpty')}</div></aside>
    }
    const entries = [
      { label: t('recordsCode'), value: activeRecord.code },
      { label: t('recordsStatus'), value: activeRecord.status },
      { label: t('recordsPriority'), value: activeRecord.priority },
      { label: t('recordsOwner'), value: activeRecord.owner_name ?? '' },
      { label: t('recordsProject'), value: activeRecord.project_name },
      { label: t('deadline'), value: activeRecord.due_date },
      ...(activeRecord.fields ?? []),
    ].filter(entry => entry.value.length > 0)
    return (
      <aside className={css.detailPanel}>
        <div className={css.detailHead}>
          <div className={css.detailTitle}>{recordTitle(activeRecord)}</div>
          <div className={css.detailBadges}>
            {activeRecord.overdue && <span className={`${css.badge} ${css.badgeDanger}`}>{t('overdue')}</span>}
            {activeRecord.status.length > 0 && <span className={css.badge}>{activeRecord.status}</span>}
          </div>
        </div>
        <div className={css.groupTitle}>{t('recordsDetail')}</div>
        <dl className={css.detailList}>
          {entries.map((entry, index) => (
            <div key={`${entry.label}:${index}`} className={css.detailRow}>
              <dt className={css.detailKey}>{entry.label}</dt>
              <dd className={css.detailValue}>{entry.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    )
  }

  const renderDomainRecords = () => {
    if (records.loading && records.data === undefined) {
      return <div className={css.empty}>{t('recordsLoading')}</div>
    }
    if (records.error !== undefined) return <div className={css.error}>{t(records.error)}</div>
    const data = records.data
    if (data === undefined || data.items.length === 0) {
      return <div className={css.empty}>{t('sectionEmpty')}</div>
    }
    return (
      <div className={css.recordLayout}>
        <div className={css.recordMain}>
          <div className={css.groupTitle}>
            {domainMeta?.group !== undefined ? `${domainMeta.group} · ` : ''}
            {t('recordsTotal', { count: data.total })}
          </div>
          {renderDomainTable(data.items)}
        </div>
        {renderRecordDetail()}
      </div>
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
    if (domain !== undefined) return renderDomainRecords()
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
    if (domain !== undefined) {
      void loadRecords(domain)
      void loadNavigator()
      return
    }
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

  const dashboardHome = section === 'home' && domain === undefined && selected === undefined
    && homeView === 'dashboard' && home.home !== undefined && isDashboardSections(home.home.sections)
  const pageTitle = domain !== undefined
    ? domainMeta?.title ?? t(SECTION_TITLES.home)
    : section === 'home'
      ? (homeView === 'cockpit' ? t('cockpitTitle') : workbenchName ?? t(SECTION_TITLES.home))
      : t(SECTION_TITLES[section])
  const reloading = domain !== undefined
    ? records.loading
    : section === 'home'
      ? (homeView === 'cockpit' ? cockpit.loading : home.loading)
      : catalogLoading
  const headerDate = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  const renderStaticNavGroup = (group: (typeof NAV_GROUPS)[number]) => (
    <div key={group.titleKey} className={css.navGroup}>
      <div className={css.navGroupTitle}>{t(group.titleKey)}</div>
      {group.items.map((item) => {
        const count = navCounts[item.section]
        const active = section === item.section && selected === undefined && domain === undefined
        return (
          <button
            key={item.section}
            className={`${css.navItem} ${active ? css.navItemActive : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => { selectSection(item.section) }}
          >
            <span className={css.navGlyph}>{item.glyph}</span>
            <span className={css.navLabel}>{t(item.labelKey)}</span>
            {count !== undefined && <span className={css.navCount}>{count}</span>}
          </button>
        )
      })}
    </div>
  )

  const renderBusinessNav = (group: YuanShuWorkbenchNavigator['groups'][number]) => (
    <div key={group.code} className={css.navGroup}>
      <div className={css.navGroupTitle}>{group.title}</div>
      {group.items.map((item) => {
        const active = domain === item.code && selected === undefined
        return (
          <button
            key={item.code}
            className={`${css.navItem} ${active ? css.navItemActive : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => { selectDomain(item.code) }}
          >
            <span className={css.navGlyph}>{DOMAIN_GLYPHS[group.code] ?? '▦'}</span>
            <span className={css.navLabel}>{item.title}</span>
            <span className={css.navCount}>{item.count}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div className={css.container}>
      <aside className={css.nav}>
        <div className={css.brand}>
          <div className={css.brandRow}>
            <span className={css.brandMark}>✓</span>
            <div className={css.brandText}>
              <div className={css.brandTitle}>{t('workbenchTitle')}</div>
              <div className={css.brandSub}>{workbenchName ?? t('workbenchSubtitle')}</div>
            </div>
          </div>
        </div>
        <nav className={css.navList} aria-label={t('workbenchTitle')}>
          {NAV_GROUPS.slice(0, 1).map(renderStaticNavGroup)}
          <div className={css.navGroupTitle}>{t('navGroupExplore')}</div>
          {navigator.data?.groups.map(renderBusinessNav)}
          {navigator.error !== undefined && (
            <div className={css.navNote}>{t(navigator.error)}</div>
          )}
          {NAV_GROUPS.slice(1).map(renderStaticNavGroup)}
        </nav>
        {dashboardHome && (
          <div className={css.navPromo}>
            <div className={css.navPromoTitle}>{t('navPromoTitle')}</div>
            <div className={css.navPromoDesc}>{t('navPromoDesc')}</div>
          </div>
        )}
      </aside>
      <main className={css.main}>
        <header className={css.header}>
          <div className={css.headerLeft}>
            <div className={css.title}>{pageTitle}</div>
            {dashboardHome && <span className={css.headerDate}>{headerDate}</span>}
          </div>
          <div className={css.headerRight}>
            {dashboardHome && (
              <input
                className={css.search}
                type="search"
                value={query}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                onChange={(event) => { setQuery(event.target.value) }}
              />
            )}
            <select
              className={css.headerTenant}
              aria-label={t('activeTenant')}
              value={tenant ?? ''}
              onChange={(event) => { changeTenant(event.target.value) }}
            >
              <option value="">{t('tenantDefault')}</option>
              {tenants.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
            <span className={css.accountChip}>
              <span className={css.accountAvatar}>{initialOf(accountName)}</span>
              <span className={css.accountName}>{accountName}</span>
            </span>
            <button className={css.reload} disabled={reloading} onClick={reload}>
              {reloading ? t('capabilityLoading') : t('reload')}
            </button>
          </div>
        </header>
        <div className={css.body}>{renderBody()}</div>
      </main>
    </div>
  )
}
