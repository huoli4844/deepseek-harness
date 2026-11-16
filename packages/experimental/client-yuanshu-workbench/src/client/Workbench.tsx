/** Role-adapted dashboards and shared workspace rendered in a native DSH panel. */
import { useRef, useState } from 'react'
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Tag,
  IconLayersOutlineRegular,
  IconChecklistOutlineRegular,
  IconClockOutlineRegular,
  IconUsersOutlineRegular,
  IconCompareSplitOutlineRegular,
  IconArchiveOutlineRegular,
  IconPaperclipOutlineRegular,
  IconPanelLeftOutlineRegular,
  IconPlusOutlineRegular,
  IconChevronRightOutlineRegular,
  IconSearchOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { DraftVersion, RoleId, TaskId, WorkbenchStoreProps } from './model.ts'
import type { WorkbenchKey } from './locales.ts'
import { managementDomains, navigation, roleFixtures, roleGroups, roleIds, taskTitles } from './fixtures.ts'
import css from './Workbench.module.css'
import { DashboardCharts } from './DashboardCharts.tsx'
import { dashboardCharts } from './dashboard-data.ts'
import { methodFor, roleMethods, type MethodStage } from './methodology-data.ts'
import { dailyWorkForRole, positionScenarios } from './scenario-data.ts'

interface WorkbenchInjected {
  readonly onReturn: () => void
}
type WorkbenchProps = PropsRuntime<'main'> &
  PropsLocale<'yuanshu.workbench'> &
  WorkbenchStoreProps &
  InjectFace<WorkbenchInjected>

/**
 * Reuse the existing layers icon in the DSH global panel list.
 * @param props - Host-owned icon size and selected state.
 * @returns the stock DSH glyph.
 */
export function WorkbenchIcon(props: SidebarPanelIconOwnerProps) {
  return <IconLayersOutlineRegular size={props.size} />
}

const navIcons = {
  assistant: IconLayersOutlineRegular,
  dashboard: IconLayersOutlineRegular,
  tasks: IconChecklistOutlineRegular,
  versions: IconCompareSplitOutlineRegular,
  calendar: IconClockOutlineRegular,
  team: IconUsersOutlineRegular,
  notifications: IconArchiveOutlineRegular,
  files: IconPaperclipOutlineRegular,
  methods: IconLayersOutlineRegular,
}

/**
 * Render plugin-owned demonstration data with DSH controls, localization, and state.
 * @param props - Framework selectors, declared actions, locale, and return callback.
 * @returns the workbench main-panel content.
 */
export function Workbench(props: WorkbenchProps) {
  const { t, actions, onReturn } = props
  const state = props.useStore(s => s)
  const { role, view } = state
  const fixture = roleFixtures[role]
  const [navOpen, setNavOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState<MethodStage>(0)
  const [candidate, setCandidate] = useState(false)
  const [activeScenario, setActiveScenario] = useState<number | null>(null)
  const [dialog, setDialog] = useState<'submit' | 'event' | 'source' | 'compare' | null>(null)
  const [eventTitle, setEventTitle] = useState('')
  const [selectedVersion, setSelectedVersion] = useState(0)
  const [feedback, setFeedback] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const key = `${role}:${state.task}`
  const draft = state.drafts[key]
  const practice = methodFor(role, state.task)
  const method = practice.method
  const initial = t('guide.draftTemplate', {
    task: t(taskTitles[state.task]), method: t(method.title), output: t(practice.output), acceptance: t(practice.acceptance),
  })
  const suggestedStructure = t('guide.candidateTemplate', {
    task: t(taskTitles[state.task]), inputs: t(practice.inputs), output: t(practice.output), acceptance: t(practice.acceptance),
  })
  const execution = draft?.execution ?? { evidence: '', analysis: '', checked: [] }
  const text = draft?.text ?? initial
  const versions = draft?.versions ?? [{ number: 1, text: initial, execution }]
  const methodReady = execution.checked.length === 4 && execution.evidence.trim() !== '' && execution.analysis.trim() !== '' && text.trim() !== ''
  const currentTitle = t(taskTitles[state.task])
  const unread = [0, 1, 2].filter(id => !state.read.includes(id)).length
  const title = view === 'work' ? currentTitle : t(navigation.find(n => n.id === view)?.label ?? 'nav.assistant')
  const selectView = (next: typeof view) => {
    actions.navigate(next)
    setNavOpen(false)
    setFeedback('')
    if (contentRef.current !== null) contentRef.current.scrollTop = 0
  }
  const selectPosition = (next: RoleId) => {
    actions.changeRole(next)
    selectView('assistant')
    setQuery('')
    setCandidate(false)
    setActiveScenario(null)
    setSelectedVersion(0)
  }
  const openTask = (id: TaskId) => {
    actions.openTask(id)
    setStage(0)
    setCandidate(false)
    setActiveScenario(null)
    setFeedback('')
    setNavOpen(false)
    if (contentRef.current !== null) contentRef.current.scrollTop = 0
  }
  const openScenario = (kpiIndex: number, id: TaskId) => {
    openTask(id)
    setActiveScenario(kpiIndex)
    setCandidate(true)
  }
  const taskRows = (compact = false) => (
    <div className={css.taskRows}>
      {fixture.tasks
        .filter(id => t(taskTitles[id]).toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .map((id, i) => (
          <button
            key={id}
            className={css.taskRow}
            onClick={() => {
              openTask(id)
            }}
          >
            <span className={css.taskIcon}>
              <IconChecklistOutlineRegular size={18} />
            </span>
            <span className={css.grow}>
              <strong>{t(taskTitles[id])}</strong>
              <small>{t(`${role}.focus`)}</small>
              <small>{t('guide.applied')} · {t(methodFor(role, id).method.title)}</small>
            </span>
            {!compact && (
              <span className={css.due}>{t(i === 0 ? 'task.today' : i === 1 ? 'task.tomorrow' : 'task.friday')}</span>
            )}
            <Tag>
              {t(
                state.drafts[`${role}:${id}`]?.submitted
                  ? 'work.submitted'
                  : i === 0
                    ? 'status.review'
                    : 'status.pending',
              )}
            </Tag>
            <IconChevronRightOutlineRegular size={14} />
          </button>
        ))}
      {fixture.tasks.every(id => !t(taskTitles[id]).toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (
        <p className={css.empty}>{t('noMatches')}</p>
      )}
    </div>
  )
  const methodCards = (compact = false) => (
    <div className={css.methodCards}>
      {roleMethods[role].map(assignment => (
        <article className={css.card} key={assignment.task}>
          <Tag>{t(assignment.method.title)}</Tag>
          <h3>{t(taskTitles[assignment.task])}</h3>
          {!compact && <>
            <p className={css.intro}>{t(assignment.method.why)}</p>
            <dl className={css.methodFacts}>
              <dt>{t('guide.inputs')}</dt><dd>{t(assignment.inputs)}</dd>
              <dt>{t('guide.output')}</dt><dd>{t(assignment.output)}</dd>
              <dt>{t('guide.acceptance')}</dt><dd>{t(assignment.acceptance)}</dd>
            </dl>
          </>}
          <Button variant="outline" onClick={() => { openTask(assignment.task) }}>
            {t('guide.start')}
          </Button>
        </article>
      ))}
    </div>
  )
  const methodChecks = () => (
    <div className={css.methodChecks}>
      <dl className={css.methodFacts}>
        <dt>{t('guide.evidence')}</dt><dd>{execution.evidence || t('guide.unrecorded')}</dd>
        <dt>{t('guide.analysis')}</dt><dd>{execution.analysis || t('guide.unrecorded')}</dd>
        <dt>{t('guide.output')}</dt><dd>{t(practice.output)}</dd>
        <dt>{t('guide.acceptance')}</dt><dd>{t(practice.acceptance)}</dd>
      </dl>
      <div className={css.methodRecords}>
        <Button onClick={() => { setDialog(null); setStage(0) }}>{t('guide.evidence')} · {t(execution.evidence.trim() ? 'guide.recorded' : 'guide.unrecorded')}</Button>
        <Button onClick={() => { setDialog(null); setStage(1) }}>{t('guide.analysis')} · {t(execution.analysis.trim() ? 'guide.recorded' : 'guide.unrecorded')}</Button>
      </div>
      {([0, 1, 2, 3] as const).map(step => (
        <Checkbox key={step} checked={execution.checked.includes(step)}
          label={t(`guide.check${step}`)}
          onChange={(checked) => { actions.checkMethod(key, step, checked, initial) }} />
      ))}
      <p className={css.intro}>{t(methodReady ? 'guide.ready' : 'guide.missing')}</p>
    </div>
  )
  const executionSnapshot = (version: DraftVersion | undefined) => version === undefined ? null : (
    <div className={css.methodSnapshot}>
      <h3>{t('guide.snapshot')}</h3>
      <p>{t('guide.progress', { done: version.execution.checked.length })}</p>
      <p>{t('guide.evidence')}: {version.execution.evidence || t('guide.unrecorded')}</p>
      <p>{t('guide.analysis')}: {version.execution.analysis || t('guide.unrecorded')}</p>
    </div>
  )
  const chart = () => {
    const coords = fixture.trend.map((value, i) => `${32 + i * 60},${160 - value * 1.3}`).join(' ')
    return (
      <button
        className={css.trendButton}
        onClick={() => {
          selectView('tasks')
        }}
        aria-label={t('chart.detail')}
      >
        <svg className={css.trend} viewBox="0 0 370 190" role="img" aria-label={t(`${role}.chart`)}>
          <title>{t(`${role}.chart`)}</title>
          {[40, 60, 80, 100].map(n => (
            <g key={n}>
              <line x1="30" x2="347" y1={160 - n * 1.3} y2={160 - n * 1.3} />
              <text x="0" y={164 - n * 1.3}>
                {n}
              </text>
            </g>
          ))}
          <polyline points={coords} />
          {fixture.trend.map((value, i) => (
            <g key={i}>
              <circle cx={32 + i * 60} cy={160 - value * 1.3} r="3.5">
                <title>
                  {t('trend.week', { value: i + 1 })}: {value}%
                </title>
              </circle>
              <text x={26 + i * 60} y="182">
                {t('trend.week', { value: i + 1 })}
              </text>
            </g>
          ))}
        </svg>
      </button>
    )
  }
  const assistant = () => (
    <>
      <div className={css.pageHeading}>
        <div>
          <p className={css.eyebrow}>{t('tenant')} / {t(`role.${role}`)}</p>
          <h1>{t('assistant.title')}</h1>
          <p>{t('assistant.subtitle')}</p>
        </div>
        <Button
          variant="primary"
          icon={<IconPlusOutlineRegular size={16} />}
          onClick={() => { selectView('methods') }}
        >
          {t('new')}
        </Button>
      </div>
      <div className={css.assistantLayout}>
        <section className={css.assistantPriority} aria-labelledby="assistant-priority-title">
          <div className={css.sectionHeading}>
            <h2 id="assistant-priority-title">{t('assistant.priority')}</h2>
            <Tag>{t('demoSample')}</Tag>
          </div>
          <p className={css.eyebrow}>{t('assistant.roleFocus')}</p>
          <h2 className={css.assistantTaskTitle}>{t(taskTitles[fixture.tasks[0]])}</h2>
          <p className={css.assistantReason}>{t(`${role}.focus`)}</p>
          <div className={css.assistantSource}>
            <small>{t('assistant.source')}</small>
            <strong>{t(`${role}.metric2`)} · {fixture.metrics[1]}</strong>
          </div>
          <div className={css.assistantActions}>
            <Button
              variant="primary"
              icon={<IconChevronRightOutlineRegular size={16} />}
              onClick={() => { openTask(fixture.tasks[0]) }}
            >
              {t('assistant.continue')}
            </Button>
            <Button variant="outline" onClick={() => { selectView('dashboard') }}>
              {t('assistant.positionData')}
            </Button>
          </div>
        </section>
        <section className={css.assistantInbox} aria-labelledby="assistant-inbox-title">
          <div className={css.sectionHeading}>
            <h2 id="assistant-inbox-title">{t('assistant.incoming')}</h2>
            <Tag>{t('count', { count: 2 })}</Tag>
          </div>
          <p className={css.intro}>{t('assistant.incomingHint')}</p>
          <button className={css.assistantSignal} onClick={() => { openTask(fixture.tasks[1]) }}>
            <span className={css.assistantSignalMarker} aria-hidden="true" />
            <span className={css.grow}>
              <strong>{t(taskTitles[fixture.tasks[1]])}</strong>
              <small>{t('assistant.taskSource')}</small>
            </span>
            <Tag>{t('status.pending')}</Tag>
            <IconChevronRightOutlineRegular size={14} />
          </button>
          <button className={css.assistantSignal} onClick={() => { selectView('calendar') }}>
            <span className={css.assistantSignalMarker} aria-hidden="true" />
            <span className={css.grow}>
              <strong>{t('calendar.0')}</strong>
              <small>{t('assistant.calendarSource')}</small>
            </span>
            <Tag>{t('task.today')}</Tag>
            <IconChevronRightOutlineRegular size={14} />
          </button>
          <Button variant="outline" onClick={() => { selectView('tasks') }}>
            {t('allTasks')}
          </Button>
        </section>
      </div>
      <section className={css.scenarioSection} aria-label={t('assistant.kpiScenes')}>
        <div className={css.sectionHeading}>
          <div>
            <h2>{t('assistant.kpiScenes')}</h2>
            <p className={css.intro}>{t('assistant.kpiScenesHint')}</p>
          </div>
          <Tag>{t('count', { count: 4 })}</Tag>
        </div>
        <div className={css.scenarioGrid}>
          {positionScenarios[role].map(({ kpiIndex, task }) => {
            const assignment = methodFor(role, task)
            return (
              <article className={css.scenarioItem} key={kpiIndex}>
                <div className={css.scenarioKpi}>
                  <span>{t(`${role}.metric${kpiIndex + 1}` as WorkbenchKey)}</span>
                  <strong>{fixture.metrics[kpiIndex]}</strong>
                </div>
                <p className={css.eyebrow}>{t('assistant.typicalWork')}</p>
                <h3>{t(taskTitles[task])}</h3>
                <p className={css.intro}>{t(assignment.method.why)}</p>
                <dl className={css.scenarioFacts}>
                  <dt>{t('guide.inputs')}</dt><dd>{t(assignment.inputs)}</dd>
                  <dt>{t('guide.output')}</dt><dd>{t(assignment.output)}</dd>
                </dl>
                <div className={css.scenarioMethod}>
                  <small>{t('assistant.method')}</small>
                  <strong>{t(assignment.method.title)}</strong>
                </div>
                <Button
                  variant="outline"
                  onClick={() => { openScenario(kpiIndex, task) }}
                >
                  {t('assistant.leadScenario')}
                </Button>
              </article>
            )
          })}
        </div>
      </section>
      <section className={css.dailySection} aria-label={t('assistant.dailyWork')}>
        <div className={css.sectionHeading}>
          <div>
            <h2>{t('assistant.dailyWork')}</h2>
            <p className={css.intro}>{t('assistant.dailyWorkHint')}</p>
          </div>
          <Tag>{t('count', { count: dailyWorkForRole(role).length })}</Tag>
        </div>
        <div className={css.dailyRows}>
          {roleMethods[role].map((assignment, index) => (
            <div className={css.dailyRow} key={assignment.task}>
              <span className={css.dailyNumber}>{index + 1}</span>
              <div className={css.grow}>
                <strong>{t(taskTitles[assignment.task])}</strong>
                <small>{t('assistant.dailyMethod', { method: t(assignment.method.title) })}</small>
              </div>
              <Button onClick={() => { openScenario(index, assignment.task) }}>{t('assistant.openDaily')}</Button>
            </div>
          ))}
        </div>
      </section>
      <div className={css.assistantFooter}>
        <div>
          <p className={css.eyebrow}>{t('assistant.scope')}</p>
          <p>{t('assistant.scopeHint')}</p>
        </div>
        <div className={css.assistantFooterActions}>
          <Button onClick={() => { selectView('notifications') }}>{t('nav.notifications')}</Button>
          <Button onClick={() => { selectView('calendar') }}>{t('goCalendar')}</Button>
          <Button onClick={() => { selectView('team') }}>{t('nav.team')}</Button>
        </div>
      </div>
    </>
  )
  const dashboard = () => (
    <>
      <div className={css.pageHeading}>
        <div>
          <p className={css.eyebrow}>
            {t('tenant')} / {t(`role.${role}`)}
          </p>
          <h1>{t(`${role}.title`)}</h1>
          <p>{t(`${role}.subtitle`)}</p>
        </div>
        <Button
          variant="primary"
          icon={<IconPlusOutlineRegular size={16} />}
          onClick={() => {
            selectView('methods')
          }}
        >
          {t('new')}
        </Button>
      </div>
      <div className={css.metrics}>
        {fixture.metrics.map((value, i) => (
          <button
            className={css.metric}
            key={i}
            onClick={() => {
              selectView('tasks')
            }}
          >
            <span>{t(`${role}.metric${i + 1}` as WorkbenchKey)}</span>
            <strong>{value}</strong>
            <small>{t('demoSample')}</small>
          </button>
        ))}
      </div>
      <div className={css.chartSectionHeading}>
        <h2>{t('nav.dashboard')}</h2>
        <Tag>{t(role === 'executive' || role === 'president' ? 'chart.eight' : 'chart.six')}</Tag>
      </div>
      <div className={css.chartGrid}>
        <section className={css.card} data-dashboard-chart="trend" aria-label={t(`${role}.chart`)}>
          <div className={css.sectionHeading}>
            <h2>{t(`${role}.chart`)}</h2>
            <small>{t('chart.unit')}</small>
          </div>
          {chart()}
          <p className={css.chartCaption}>{t('chartHint')}</p>
        </section>
        <section className={css.card} data-dashboard-chart="progress" aria-label={t(`${role}.bars`)}>
          <div className={css.sectionHeading}>
            <h2>{t(`${role}.bars`)}</h2>
            <small>{t('thisWeek')}</small>
          </div>
          <div className={css.bars}>
            {fixture.bars.map((value, i) => (
              <button
                key={i}
                className={css.barRow}
                onClick={() => {
                  selectView('tasks')
                }}
              >
                <span>{t(`${role}.bar${i + 1}` as WorkbenchKey)}</span>
                <b>{value}%</b>
                <span className={css.barTrack}>
                  <span style={{ width: `${value}%` }} />
                </span>
              </button>
            ))}
          </div>
        </section>
        <DashboardCharts t={t} charts={dashboardCharts[role]} tasks={fixture.tasks} onTask={openTask} />
      </div>
      {(role === 'executive' || role === 'president') && (
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('management.title')}</h2>
            <Tag>{t('demoSample')}</Tag>
          </div>
          <p className={css.intro}>{t(role === 'executive' ? 'management.note' : 'demoNote')}</p>
          <div className={css.companyOverview}>
            {managementDomains.map(domain => (
              <article key={domain.id} className={css.companyRow}>
                <div>
                  <h3>{t(domain.label)}</h3>
                  <small>{t(`role.${domain.role}`)}</small>
                </div>
                <div className={css.companyProgress}>
                  <span>{t('percent', { value: domain.progress })}</span>
                  <div className={css.barTrack}>
                    <span style={{ width: `${domain.progress}%` }} />
                  </div>
                </div>
                <p>{t(domain.risk)}</p>
                <Button
                  size="sm"
                  onClick={() => {
                    selectPosition(domain.role)
                  }}
                >
                  {t('management.open')}
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className={css.sectionHeading}>
        <h2>{t('guide.roleTitle')}</h2>
        <Button onClick={() => { selectView('methods') }}>{t('guide.library')}</Button>
      </div>
      {methodCards(true)}
      <div className={css.focusStrip}>
        <IconLayersOutlineRegular size={20} />
        <div>
          <small>{t('focus')}</small>
          <p>{t(`${role}.focus`)}</p>
        </div>
        <Button
          onClick={() => {
            openTask(fixture.tasks[0])
          }}
        >
          {t('open')}
        </Button>
      </div>
      <div className={css.dashboardBottom}>
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('upcoming')}</h2>
            <Button
              size="sm"
              onClick={() => {
                selectView('tasks')
              }}
            >
              {t('allTasks')}
            </Button>
          </div>
          {taskRows(true)}
        </section>
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('schedule')}</h2>
            <Button
              size="sm"
              onClick={() => {
                selectView('calendar')
              }}
            >
              {t('goCalendar')}
            </Button>
          </div>
          <div className={css.agenda}>
            <span>09:30</span>
            <div>
              <strong>{t('calendar.0')}</strong>
              <small>{t('nav.team')}</small>
            </div>
            <span>14:00</span>
            <div>
              <strong>{t('calendar.2')}</strong>
              <small>{t('role.director')}</small>
            </div>
          </div>
          <Button
            onClick={() => {
              selectView('team')
            }}
          >
            {t('goTeam')}
          </Button>
        </section>
      </div>
    </>
  )
  const versionPage = () => (
    <>
      <p className={css.intro}>{t('versions.intro')}</p>
      <div className={css.versionSelect}>
        {fixture.tasks.map(id => (
          <Button
            key={id}
            variant={state.task === id ? 'outline' : 'ghost'}
            onClick={() => {
              actions.openTask(id)
              actions.navigate('versions')
            }}
          >
            {t(taskTitles[id])}
          </Button>
        ))}
      </div>
      <section className={css.card}>
        <h2>{currentTitle}</h2>
        <p className={css.intro}>{t(`role.${role}`)}</p>
        {versions.toReversed().map(v => (
          <div className={css.versionRow} key={v.number}>
            <span className={css.versionBadge}>{t('versionNumber', { number: v.number })}</span>
            <div className={css.grow}>
              <strong>{t(v.number === 1 ? 'versions.initial' : 'versions.saved')}</strong>
              <p>{v.text}</p>
              <details className={css.methodSnapshot}>
                <summary>{t('guide.snapshot')} · {t(method.title)} · {t('guide.progress', { done: v.execution.checked.length })}</summary>
                <h3>{t('guide.evidence')}</h3><p>{v.execution.evidence || t('guide.unrecorded')}</p>
                <h3>{t('guide.analysis')}</h3><p>{v.execution.analysis || t('guide.unrecorded')}</p>
              </details>
            </div>
            <Button
              onClick={() => {
                setSelectedVersion(v.number - 1)
                setDialog('compare')
              }}
            >
              {t('versions.compare')}
            </Button>
          </div>
        ))}
        <Button
          onClick={() => {
            openTask(state.task)
          }}
        >
          {t('work.draft')}
        </Button>
      </section>
    </>
  )
  const calendarPage = () => (
    <>
      <p className={css.intro}>{t('calendar.intro')}</p>
      <div className={css.calendarLayout}>
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('calendar.month')}</h2>
            <Tag>{t('demoSample')}</Tag>
          </div>
          <div className={css.calendar}>
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <span className={css.weekday} key={`week-${i}`}>
                {t(`week.${i}` as WorkbenchKey)}
              </span>
            ))}
            {Array.from({ length: 42 }, (_, i) => {
              const day = i - 5
              return day < 1 || day > 30 ? (
                <span key={`blank-${i}`} />
              ) : (
                <button
                  key={day}
                  aria-label={t('calendar.day', { day })}
                  aria-pressed={state.day === day}
                  className={state.day === day ? css.selectedDay : ''}
                  onClick={() => {
                    actions.selectDay(day)
                  }}
                >
                  <span>{day}</span>
                  {([16, 17, 20].includes(day) || state.events.some(e => e.day === day)) && <i />}
                </button>
              )
            })}
          </div>
        </section>
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('calendar.day', { day: state.day })}</h2>
          </div>
          <div className={css.dayEvents}>
            {[16, 17, 20].includes(state.day) && (
              <button
                onClick={() => {
                  openTask(fixture.tasks[0])
                }}
              >
                <small>09:30 — 10:00</small>
                <strong>{t(state.day === 16 ? 'calendar.0' : state.day === 17 ? 'calendar.1' : 'calendar.2')}</strong>
              </button>
            )}
            {state.events
              .filter(e => e.day === state.day)
              .map(e => (
                <div key={e.id}>
                  <small>{t('demoEvent')}</small>
                  <strong>{e.title}</strong>
                </div>
              ))}
            {![16, 17, 20].includes(state.day) && !state.events.some(e => e.day === state.day) && (
              <p className={css.empty}>{t('calendar.none')}</p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setEventTitle('')
              setDialog('event')
            }}
          >
            {t('calendar.add')}
          </Button>
        </section>
      </div>
    </>
  )
  const teamPage = () => (
    <>
      <p className={css.intro}>{t('team.intro')}</p>
      <section className={css.card}>
        <div className={css.sectionHeading}>
          <h2>{t(taskTitles[fixture.tasks[0]])}</h2>
          <Button
            onClick={() => {
              openTask(fixture.tasks[0])
            }}
          >
            {t('open')}
          </Button>
        </div>
        <div className={css.teamGrid}>
          {roleIds.map(id => (
            <article key={id} className={css.teamMember}>
              <span className={css.person}>
                <IconUsersOutlineRegular size={22} />
              </span>
              <h3>{t(`role.${id}`)}</h3>
              <p>{t(`team.${id}`)}</p>
              <Tag>{t(id === role ? 'selected' : 'status.waiting')}</Tag>
              <Button
                onClick={() => {
                  selectPosition(id)
                  openTask(roleFixtures[id].tasks[0])
                }}
              >
                {t('team.switch')}
              </Button>
            </article>
          ))}
        </div>
        <p className={css.intro}>{t('team.note')}</p>
      </section>
    </>
  )
  const notificationsPage = () => (
    <>
      <div className={css.sectionHeading}>
        <p className={css.intro}>{t('notifications.intro')}</p>
        <Button
          onClick={() => {
            actions.markAllRead()
          }}
        >
          {t('notifications.readAll')}
        </Button>
      </div>
      <section className={css.card}>
        {[0, 1, 2].map(id => (
          <article key={id} className={css.notification}>
            <span className={state.read.includes(id) ? css.readDot : css.unreadDot} />
            <div className={css.grow}>
              <h3>{t(`notification.${id}` as WorkbenchKey)}</h3>
              <p>
                {t(taskTitles[fixture.tasks[0]])} · {t('demoSample')}
              </p>
            </div>
            <Tag>{t(state.read.includes(id) ? 'notifications.read' : 'notifications.unread')}</Tag>
            <Button
              onClick={() => {
                actions.markRead(id)
                openTask(fixture.tasks[0])
              }}
            >
              {t('open')}
            </Button>
            {!state.read.includes(id) && (
              <Button
                onClick={() => {
                  actions.markRead(id)
                }}
              >
                {t('notifications.mark')}
              </Button>
            )}
          </article>
        ))}
      </section>
    </>
  )
  const workPage = () => (
    <>
      <div className={css.workHeading}>
        <div>
          <p className={css.eyebrow}>
            {t(`role.${role}`)} / {t('draftOnly')}
          </p>
          <h1>{currentTitle}</h1>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setDialog('submit')
          }}
        >
          {t(draft?.submitted ? 'work.submitted' : 'work.submit')}
        </Button>
      </div>
      <div className={`${css.card} ${css.methodBanner}`}>
        <div className={css.sectionHeading}>
          <div><small>{t('guide.applied')}</small><h2>{t(method.title)}</h2></div>
          <Tag>{t('guide.progress', { done: execution.checked.length })}</Tag>
        </div>
        <p>{t(method.why)}</p>
      </div>
      {activeScenario !== null && (
        <section className={`${css.card} ${css.scenarioLead}`} aria-label={t('assistant.leadPanel')}>
          <div className={css.sectionHeading}>
            <div>
              <p className={css.eyebrow}>{t('assistant.leadPanel')}</p>
              <h2>{t(`${role}.metric${activeScenario + 1}` as WorkbenchKey)} · {fixture.metrics[activeScenario]}</h2>
            </div>
            <Tag>{t('assistant.aiLead')}</Tag>
          </div>
          <p>{t('assistant.leadPlan', { method: t(method.title), work: currentTitle })}</p>
          <p className={css.intro}>{t('assistant.humanReview')}</p>
        </section>
      )}
      <nav className={css.stages} aria-label={t('work.title')}>
        {([0, 1, 2, 3] as const).map(i => (
          <Button
            key={i}
            aria-current={stage === i ? 'step' : undefined}
            variant={stage === i ? 'outline' : 'ghost'}
            onClick={() => {
              setStage(i)
            }}
          >
            {i + 1} · {t((['stage.materials', 'stage.analysis', 'stage.result', 'stage.review'] as const)[i])}
          </Button>
        ))}
      </nav>
      <div className={css.workLayout}>
        <section className={css.card}>
          <div className={css.methodStep}>
            <small>{t('guide.title')}</small>
            <h2>{t(method.steps[stage].title)}</h2>
            <p>{t(method.steps[stage].prompt)}</p>
            <dl className={css.methodFacts}>
              <dt>{t(stage === 0 ? 'guide.inputs' : stage === 1 || stage === 3 ? 'guide.acceptance' : 'guide.output')}</dt>
              <dd>{t(stage === 0 ? practice.inputs : stage === 1 || stage === 3 ? practice.acceptance : practice.output)}</dd>
            </dl>
          </div>
          {stage === 0 ? (
            <>
              <h2>{t('work.evidence')}</h2>
              {[0, 1, 2].map(id => (
                <button
                  className={css.source}
                  key={id}
                  onClick={() => {
                    setDialog('source')
                  }}
                >
                  <IconPaperclipOutlineRegular size={18} />
                  {t(`${role}.source${id}` as WorkbenchKey)}
                  <IconChevronRightOutlineRegular size={14} />
                </button>
              ))}
              <label className={css.field}>
                {t('guide.evidence')}
                <textarea value={execution.evidence} onChange={(e) => {
                  actions.recordMethod(key, 'evidence', e.target.value, initial)
                }} />
              </label>
            </>
          ) : stage === 1 ? (
            <>
              <h2>{t('analysis.title')}</h2>
              <p className={css.intro}>{t('analysis.body')}</p>
              <p className={css.notice}>{t(`${role}.warning`)}</p>
              <label className={css.field}>
                {t('guide.analysis')}
                <textarea value={execution.analysis} onChange={(e) => {
                  actions.recordMethod(key, 'analysis', e.target.value, initial)
                }} />
              </label>
            </>
          ) : stage === 3 ? (
            <>
              <h2>{t('stage.review')}</h2>
              <p className={css.intro}>{t(draft?.submitted ? 'work.submitted' : 'work.reviewNote')}</p>
              {methodChecks()}
              <label className={css.field}>
                {t('work.comment')}
                <textarea
                  value={draft?.comment ?? ''}
                  onChange={(e) => {
                    actions.comment(key, e.target.value, initial)
                  }}
                />
              </label>
              <Button
                onClick={() => {
                  setFeedback(t('work.commentSave'))
                }}
              >
                {t('work.commentSave')}
              </Button>
            </>
          ) : (
            <>
              <div className={css.sectionHeading}>
                <h2>{currentTitle}</h2>
                <Button
                  size="sm"
                  onClick={() => {
                    selectView('versions')
                  }}
                >
                  {t('versionNumber', { number: versions.length })}
                </Button>
              </div>
              <p className={css.intro}>{t('work.context')}</p>
              <p className={css.notice}>{t(`${role}.warning`)}</p>
              <label className={css.field}>
                {t('work.draft')}
                <textarea
                  value={text}
                  onChange={(e) => {
                    actions.editDraft(key, e.target.value, initial)
                  }}
                />
              </label>
              <div className={css.sectionHeading}>
                <small>{t('draftOnly')}</small>
                <Button
                  variant="outline"
                  onClick={() => {
                    actions.saveDraft(key, initial)
                    setFeedback(t('work.saved'))
                  }}
                >
                  {t('work.save')}
                </Button>
              </div>
            </>
          )}
          {stage !== 3 && <div className={css.methodChecks}>
            <Checkbox checked={execution.checked.includes(stage)} label={t('guide.stageDone')}
              onChange={(checked) => { actions.checkMethod(key, stage, checked, initial) }} />
            <Button variant="outline" onClick={() => { setStage(stage === 0 ? 1 : stage === 1 ? 2 : 3) }}>
              {t((['stage.analysis', 'stage.result', 'stage.review'] as const)[stage])}
              <IconChevronRightOutlineRegular size={14} />
            </Button>
          </div>}
          <p className={css.intro}>{t('guide.recordHint')}</p>
        </section>
        <aside className={css.card}>
          <h2>{t('guide.title')}</h2>
          <ol className={css.methodSteps}>
            {([0, 1, 2, 3] as const).map(index => (
              <li key={index}>
                <Button variant={stage === index ? 'outline' : 'ghost'} aria-current={stage === index ? 'step' : undefined}
                  onClick={() => { setStage(index) }}>{t(method.steps[index].title)}</Button>
              </li>
            ))}
          </ol>
          <dl className={css.methodFacts}>
            <dt>{t('guide.output')}</dt><dd>{t(practice.output)}</dd>
            <dt>{t('guide.acceptance')}</dt><dd>{t(practice.acceptance)}</dd>
          </dl>
          <p className={css.intro}>{t('guide.prototype')}</p>
          <details className={css.methodSnapshot} open={activeScenario !== null}>
            <summary>{t('work.ai')}</summary>
            <div className={css.sectionHeading}>
              <h2>{t('work.ai')}</h2>
              <IconLayersOutlineRegular size={18} />
            </div>
            <p className={css.intro}>{t('work.aiHint')}</p>
            <p>{t('work.aiEmpty')}</p>
            <Button
              variant="outline"
              onClick={() => {
                setCandidate(true)
              }}
            >
              {t('work.aiAsk')}
            </Button>
            {candidate && (
              <div className={css.candidate}>
                <h3>{t('work.aiCandidate')}</h3>
                <p>{suggestedStructure}</p>
                <Button
                  variant="primary"
                  onClick={() => {
                    actions.editDraft(key, suggestedStructure, initial)
                    setCandidate(false)
                    setStage(2)
                  }}
                >
                  {t('work.adopt')}
                </Button>
                <Button
                  onClick={() => {
                    setCandidate(false)
                  }}
                >
                  {t('work.dismiss')}
                </Button>
              </div>
            )}
          </details>
        </aside>
      </div>
    </>
  )
  return (
    <Modal open headless title={t('panel')} onClose={onReturn} className={`${css.surface}`} backdropBlur={false}>
      <div className={css.root}>
        <aside className={`${css.navigation} ${navOpen ? css.openNavigation : ''}`} aria-label={t('navLabel')}>
          <div className={css.brand}>
            <IconLayersOutlineRegular size={22} />
            <div>
              <strong>{t('panel')}</strong>
              <small>{t('tenant')}</small>
            </div>
          </div>
          <label className={css.roleSelect}>
            {t('role')}
            <select
              aria-label={t('role')}
              value={role}
              onChange={(e) => {
                const id = roleIds.find(id => id === e.target.value)
                if (id) {
                  selectPosition(id)
                }
              }}
            >
              {roleGroups.map(group => (
                <optgroup key={group.label} label={t(group.label)}>
                  {group.roles.map(id => (
                    <option key={id} value={id}>
                      {t(`role.${id}`)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <small className={css.positionCount}>{t('roleCount')}</small>
          <nav>
            {navigation.map((n) => {
              const Icon = navIcons[n.id]
              return (
                <div key={n.id}>
                  {n.id === 'tasks' && <p className={css.groupLabel}>{t('public')}</p>}
                  {n.id === 'files' && <p className={css.groupLabel}>{t('resources')}</p>}
                  <button
                    className={view === n.id ? css.activeNav : ''}
                    onClick={() => {
                      selectView(n.id)
                    }}
                    aria-current={view === n.id ? 'page' : undefined}
                  >
                    <Icon size={17} />
                    <span>{t(n.label)}</span>
                    {n.id === 'notifications' && unread > 0 && <b>{unread}</b>}
                  </button>
                </div>
              )
            })}
          </nav>
          <div className={css.return}>
            <Button icon={<IconPanelLeftOutlineRegular size={17} />} onClick={onReturn} title={t('returnHint')}>
              {t('return')}
            </Button>
            <small>{t('returnHint')}</small>
          </div>
        </aside>
        <div className={css.main}>
          <header className={css.topbar}>
            <div>
              <Button
                className={css.menuToggle}
                aria-expanded={navOpen}
                aria-label={t('openNav')}
                onClick={() => {
                  setNavOpen(!navOpen)
                }}
                icon={<IconPanelLeftOutlineRegular size={18} />}
              />
              <span>
                {t('tenant')} / {title}
              </span>
            </div>
            <div>
              <Tag>{t('demo')}</Tag>
              <Button
                aria-label={t('search')}
                onClick={() => {
                  selectView('tasks')
                }}
                icon={<IconSearchOutlineRegular size={17} />}
              />
            </div>
          </header>
          <div ref={contentRef} className={css.content}>
            {view !== 'dashboard' && view !== 'assistant' && view !== 'work' && (
              <div className={css.pageHeading}>
                <div>
                  <p className={css.eyebrow}>
                    {t(`role.${role}`)} / {t('public')}
                  </p>
                  <h1>{title}</h1>
                </div>
                {view === 'tasks' && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      selectView('methods')
                    }}
                  >
                    {t('new')}
                  </Button>
                )}
              </div>
            )}
            {view === 'assistant' ? (
              assistant()
            ) : view === 'dashboard' ? (
              dashboard()
            ) : view === 'tasks' ? (
              <>
                <p className={css.intro}>{t('task.owner')}</p>
                <Input
                  aria-label={t('task.search')}
                  placeholder={t('task.search')}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                  }}
                />
                <section className={css.card}>{taskRows()}</section>
              </>
            ) : view === 'versions' ? (
              versionPage()
            ) : view === 'calendar' ? (
              calendarPage()
            ) : view === 'team' ? (
              teamPage()
            ) : view === 'notifications' ? (
              notificationsPage()
            ) : view === 'work' ? (
              workPage()
            ) : view === 'files' ? (
              <>
                <p className={css.intro}>{t('files.intro')}</p>
                <section className={css.card}>
                  {[0, 1, 2].map(id => (
                    <button
                      key={id}
                      className={css.source}
                      onClick={() => {
                        setDialog('source')
                      }}
                    >
                      <IconPaperclipOutlineRegular size={18} />
                      <span className={css.grow}>{t(`${role}.source${id}` as WorkbenchKey)}</span>
                      <span>{t('files.preview')}</span>
                    </button>
                  ))}
                </section>
              </>
            ) : (
              <>
                <p className={css.intro}>{t('methods.intro')}</p>
                {methodCards()}
                <p className={css.intro}>{t('guide.prototype')}</p>
              </>
            )}
            {feedback && (
              <p role="status" className={css.feedback}>
                {feedback}
              </p>
            )}
            <p className={css.disclaimer}>{t('demoNote')}</p>
          </div>
        </div>
        <Modal
          open={dialog !== null}
          className={`${css.detailDialog}`}
          contentClassName={`${css.detailContent}`}
          footer={dialog === 'submit' ? (
            <Button variant="primary" onClick={() => {
              actions.submitDraft(key, initial)
              setDialog(null)
              setStage(3)
              setFeedback(t('work.submitted'))
            }}>{t('confirm')}</Button>
          ) : undefined}
          onClose={() => {
            setDialog(null)
          }}
          closeLabel={t('close')}
          title={t(
            dialog === 'event'
              ? 'calendar.add'
              : dialog === 'compare'
                ? 'versions.compare'
                : dialog === 'source'
                  ? 'files.preview'
                  : 'work.submit',
          )}
        >
          {dialog === 'submit' ? (
            <>
              <p>{t('work.reviewNote')}</p>
              <h3>{t('guide.reviewTitle')}</h3>
              {methodChecks()}
              <p className={css.intro}>
                {currentTitle} · {t(`role.${role}`)}
              </p>
            </>
          ) : dialog === 'event' ? (
            <form
              className={css.eventForm}
              onSubmit={(e) => {
                e.preventDefault()
                if (eventTitle.trim()) {
                  actions.addEvent(eventTitle.trim())
                  setDialog(null)
                }
              }}
            >
              <label>
                {t('calendar.title')}
                <Input
                  required
                  data-modal-autofocus
                  value={eventTitle}
                  onChange={(e) => {
                    setEventTitle(e.target.value)
                  }}
                />
              </label>
              <Button variant="primary" type="submit" disabled={!eventTitle.trim()}>
                {t('calendar.add')}
              </Button>
            </form>
          ) : dialog === 'compare' ? (
            <div className={css.compare}>
              <section>
                <h3>{t('versions.before')}</h3>
                <p>{versions[selectedVersion - 1]?.text ?? t('versions.noPrevious')}</p>
                {executionSnapshot(versions[selectedVersion - 1])}
              </section>
              <section>
                <h3>{t('versions.after')}</h3>
                <p>{versions[selectedVersion]?.text}</p>
                {executionSnapshot(versions[selectedVersion])}
              </section>
            </div>
          ) : (
            <p>{t(`${role}.focus`)}</p>
          )}
        </Modal>
      </div>
    </Modal>
  )
}
