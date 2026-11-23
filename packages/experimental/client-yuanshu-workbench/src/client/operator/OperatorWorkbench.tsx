/**
 * 运营者工作台的容器组件。
 *
 * 这是 operator 模块中唯一有状态的 React 组件，负责：
 *  - 投影数据源（数据层）与加载状态机；
 *  - 页面导航与选中状态；
 *  - 组装视图模型（视图模型层）并交给纯展示组件。
 *
 * `components/` 下的展示组件无状态、无 I/O。
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { OperatorLocaleKey, OperatorScreenId } from './model.ts'
import {
  createLiveProjectionSource,
  EMPTY_PROJECTIONS,
  ProjectionError,
  type ProjectionSource,
} from './source.ts'
import { buildOperatorViewModel, selectDecisionItem, selectProjectCard } from './viewmodel.ts'
import {
  DecisionScreen,
  EvidenceScreen,
  FunctionalScreen,
  OverviewScreen,
  ProjectScreen,
} from './components/Screens.tsx'
import css from './operator.module.css'

/** 导航分组：业务页面与追溯页面。 */
const NAV_GROUPS: readonly {
  readonly labelKey: OperatorLocaleKey
  readonly screens: readonly { readonly id: OperatorScreenId; readonly labelKey: OperatorLocaleKey }[]
}[] = [
  {
    labelKey: 'operator.group.operations',
    screens: [
      { id: 'overview', labelKey: 'operator.screen.overview' },
      { id: 'decisions', labelKey: 'operator.screen.decisions' },
      { id: 'projects', labelKey: 'operator.screen.projects' },
    ],
  },
  {
    labelKey: 'operator.group.support',
    screens: [
      { id: 'functional', labelKey: 'operator.screen.functional' },
      { id: 'evidence', labelKey: 'operator.screen.evidence' },
    ],
  },
]

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
 * 在现有主面板中挂载运营者工作台。
 * @param props.props - 本地化翻译函数，以及可选的注入数据源（测试传入假实现）。
 * @returns 带侧栏导航与当前页面的工作台外壳。
 */
export function OperatorWorkbench(props: PropsLocale<'yuanshu.workbench'> & {
  readonly source?: ProjectionSource | undefined
}) {
  const { t } = props
  const source = useMemo<ProjectionSource>(() => props.source ?? createLiveProjectionSource(), [props.source])
  const [screen, setScreen] = useState<OperatorScreenId>('overview')
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [projections, setProjections] = useState(EMPTY_PROJECTIONS)
  const [attempt, setAttempt] = useState(0)
  const [selectedDecision, setSelectedDecision] = useState<string>()
  const [selectedProject, setSelectedProject] = useState<string>()

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
        // 加载失败时也保留占位快照（EMPTY_PROJECTIONS）——
        // 规格要求不得清空工作台，也不得编造数值。
        setProjections(EMPTY_PROJECTIONS)
        setState({ kind: 'error', reason })
      }
    })()
    return () => { controller.abort() }
  }, [source, attempt])

  // 仅在投影快照变化时重算视图模型。
  const vm = useMemo(() => buildOperatorViewModel(projections), [projections])

  const openDecisionQueue = (id: string) => {
    setSelectedDecision(id)
    setScreen('decisions')
  }

  const decisionModel = useMemo(
    () => selectDecisionItem(vm.decisions, selectedDecision),
    [vm.decisions, selectedDecision],
  )
  const projectModel = useMemo(
    () => selectProjectCard(vm.projects, selectedProject),
    [vm.projects, selectedProject],
  )

  const currentTitle = NAV_GROUPS.flatMap(group => group.screens).find(entry => entry.id === screen)?.labelKey ?? 'operator.screen.overview'

  return <div className={css.shell}>
    <aside className={css.sidebar}>
      <h2 className={css.brand}>{t('panel')}</h2>
      {NAV_GROUPS.map(group => <div key={group.labelKey} className={css.group}>
        <p className={css.groupLabel}>{t(group.labelKey)}</p>
        <nav>
          {group.screens.map(entry => <button
            key={entry.id}
            className={screen === entry.id ? css.navActive : css.navButton}
            onClick={() => { setScreen(entry.id) }}
            aria-current={screen === entry.id ? 'page' : undefined}
          >
            <IconChevronRightOutlineRegular size={15} />
            <span>{t(entry.labelKey)}</span>
          </button>)}
        </nav>
      </div>)}
    </aside>

    <main className={css.main}>
      <header className={css.header}>
        <h1>{t(currentTitle)}</h1>
        {state.kind === 'loading' && <span role="status">{t('live.loading')}</span>}
        {state.kind === 'ready' && <span>{t('operator.label.freshness')}: {vm.overview.freshness.value ?? t('operator.value.noFreshness')}</span>}
        {state.kind === 'error' && <span role="alert">
          {t(failureMessageKey(state.reason))}{' '}
          <Button onClick={() => { setAttempt(value => value + 1) }}>{t('live.retry')}</Button>
        </span>}
      </header>

      {screen === 'overview' && <OverviewScreen model={vm.overview} t={t} onDecision={openDecisionQueue} />}
      {screen === 'decisions' && <DecisionScreen model={decisionModel} t={t} onSelect={setSelectedDecision} />}
      {screen === 'projects' && <ProjectScreen model={projectModel} t={t} onSelect={setSelectedProject} />}
      {screen === 'functional' && <FunctionalScreen model={vm.functional} t={t} />}
      {screen === 'evidence' && <EvidenceScreen model={vm.evidence} t={t} />}
    </main>
  </div>
}
