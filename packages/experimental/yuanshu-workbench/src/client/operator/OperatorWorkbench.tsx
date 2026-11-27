/**
 * 运营者工作台的内容容器。
 *
 * 导航外壳由工作台主框架 Workbench.tsx 统一提供，本组件不再是"应用里的应用"：
 * 它不渲染侧栏、不渲染标题栏，只接收外部传入的当前屏幕，加载投影并渲染对应内容。
 *
 * 这是 operator 模块中唯一有状态的 React 组件，负责：
 *  - 投影数据源（数据层）与加载状态机；
 *  - 内容区内部的状态（决策项、项目卡片、时间范围、工时详情弹窗）；
 *  - 组装视图模型（视图模型层）并交给纯展示组件。
 *
 * 屏幕切换通过 onNavigate 交回外层导航，不在本组件里维护第二个导航状态。
 * `components/` 下的展示组件无状态、无 I/O。
 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { OperatorLocaleKey, OperatorPeriod, OperatorScreenId } from './model.ts'
import {
  createLiveProjectionSource,
  EMPTY_PROJECTIONS,
  ProjectionError,
  type ProjectionSource,
} from './source.ts'
import { buildOperatorViewModel, filterDecisionQueue, selectDecisionItem, selectProjectCard } from './viewmodel.ts'
import {
  DecisionScreen,
  EvidenceScreen,
  FunctionalScreen,
  OverviewScreen,
  ProjectScreen,
} from './components/Screens.tsx'
import css from './operator.module.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; reason: 'login' | 'connecting' | 'denied' | 'unavailable' }

function failureMessageKey(reason: Extract<LoadState, { kind: 'error' }>['reason']): OperatorLocaleKey | 'live.login' | 'live.connecting' | 'live.denied' | 'live.unavailable' {
  return reason === 'login' ? 'live.login'
    : reason === 'connecting' ? 'live.connecting'
      : reason === 'denied' ? 'live.denied'
        : 'live.unavailable'
}

/**
 * 渲染运营者视角当前屏幕的内容区，导航与标题由外层工作台提供。
 * @param props.screen - 外层导航选中的屏幕 id。
 * @param props.onNavigate - 请求切换到其它屏幕（由外层更新导航）。
 * @param props.t - 本地化翻译函数。
 * @param props.source - 可选的注入数据源（测试传入假实现）。
 * @returns 当前屏幕的内容，无侧栏、无标题栏。
 */
export function OperatorWorkbench(props: PropsLocale<'yuanshu.workbench'> & {
  readonly screen: OperatorScreenId
  readonly onNavigate: (screen: OperatorScreenId) => void
  readonly source?: ProjectionSource | undefined
}) {
  const { t, screen } = props
  const source = useMemo<ProjectionSource>(() => props.source ?? createLiveProjectionSource(), [props.source])
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [projections, setProjections] = useState(EMPTY_PROJECTIONS)
  const [attempt, setAttempt] = useState(0)
  const [selectedDecision, setSelectedDecision] = useState<string>()
  const [selectedProject, setSelectedProject] = useState<string>()
  // 经营总览的时间范围档位（当前进展 / 当月 / 本季度 / 本年 / 总览），默认按当月。
  const [period, setPeriod] = useState<OperatorPeriod>('month')
  // 异常与决策中心的分类筛选档位。
  const [decisionFilter, setDecisionFilter] = useState('all')
  // 工时详情弹窗开关。
  const [laborDetailOpen, setLaborDetailOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      setState({ kind: 'loading' })
      try {
        const loaded = await source.load(controller.signal)
        if (controller.signal.aborted) return
        setProjections(loaded)
        setState({ kind: 'ready' })
      } catch (error) {
        if (controller.signal.aborted) return
        const reason = error instanceof ProjectionError ? error.reason : 'unavailable'
        // 加载失败时保留空投影快照——界面回退到演示数据，不清空工作台。
        setProjections(EMPTY_PROJECTIONS)
        setState({ kind: 'error', reason })
      }
    })()
    return () => { controller.abort() }
  }, [source, attempt])

  // 仅在投影快照或时间范围变化时重算视图模型。
  const vm = useMemo(() => buildOperatorViewModel(projections, period), [projections, period])

  // 异常与决策：先按分类筛选，再应用选中项（选中项不在筛选结果中时回落到第一项）。
  const decisionModel = useMemo(
    () => selectDecisionItem(filterDecisionQueue(vm.decisions, decisionFilter), selectedDecision),
    [vm.decisions, decisionFilter, selectedDecision],
  )
  const projectModel = useMemo(
    () => selectProjectCard(vm.projects, selectedProject),
    [vm.projects, selectedProject],
  )

  return <div className={css.screen}>
    {/* 状态条只在加载中或失败时出现，正常状态下不占空间。 */}
    {(state.kind === 'loading' || state.kind === 'error') && <div className={css.contextBar}>
      {state.kind === 'loading' && <span role="status">{t('live.loading')}</span>}
      {state.kind === 'error' && <span role="alert">
        {t(failureMessageKey(state.reason))}{' '}
        <Button onClick={() => { setAttempt(value => value + 1) }}>{t('live.retry')}</Button>
      </span>}
    </div>}

    {screen === 'overview' && <OverviewScreen
      model={vm.overview}
      t={t}
      period={period}
      onPeriodChange={setPeriod}
      laborDetailOpen={laborDetailOpen}
      onOpenLaborDetail={() => { setLaborDetailOpen(true) }}
      onCloseLaborDetail={() => { setLaborDetailOpen(false) }}
    />}
    {screen === 'decisions' && <DecisionScreen
      model={decisionModel}
      t={t}
      activeFilter={decisionFilter}
      onFilterChange={setDecisionFilter}
      onSelect={setSelectedDecision}
    />}
    {screen === 'projects' && <ProjectScreen model={projectModel} t={t} onSelect={setSelectedProject} />}
    {screen === 'functional' && <FunctionalScreen model={vm.functional} t={t} />}
    {screen === 'evidence' && <EvidenceScreen model={vm.evidence} t={t} />}
  </div>
}
