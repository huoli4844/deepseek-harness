/**
 * 经营总览仪表盘（导航项「dashboard」）：指标卡、趋势图、柱状图、管理层域、
 * 方法卡与日程速览。从 Workbench.tsx 抽离；共享状态经 useWorkbenchPage() 注入。
 */
import { Button, Tag, IconLayersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { managementDomains, roleFixtures } from '../../core/fixtures.ts'
import { dashboardCharts } from './dashboard-data.ts'
import { positionScenarios } from '../../core/data/scenario-data.ts'
import { DashboardCharts } from './DashboardCharts.tsx'
import { CalendarOverview } from '../calendar/CalendarOverview.tsx'
import { useWorkbenchPage, type WorkbenchT } from '../../app/page-api.ts'
import type { WorkbenchKey } from '../../core/locales/locales.ts'
import { MethodCards, PositionAlert, TaskRows, TrendChart } from '../../app/page-parts.tsx'
import css from '../../app/Workbench.module.css'

/** 渲染角色经营总览仪表盘。 */
export function DashboardScreen({ t }: { readonly t: WorkbenchT }) {
  const page = useWorkbenchPage()
  const { role, fixture, openScenario, selectView, selectPosition, openTask } = page
  return (
    <>
      <PositionAlert />
      {/* 本周工作事项 + 当天事项：与日程日历共用同一份事项数据。 */}
      <CalendarOverview t={t} />
      <div className={css.metrics}>
        {fixture.metrics.map((value, i) => (
          <button
            className={css.metric}
            key={i}
            onClick={() => {
              const scene = positionScenarios[role][i]
              if (scene !== undefined) {
                openScenario(scene.kpiIndex, scene.task)
              }
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
          <TrendChart />
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
                onClick={() => { selectView('tasks') }}
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
                    openTask(roleFixtures[domain.role].tasks[0])
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
      <MethodCards compact />
      <div className={css.focusStrip}>
        <IconLayersOutlineRegular size={20} />
        <div>
          <small>{t('focus')}</small>
          <p>{t(`${role}.focus`)}</p>
        </div>
        <Button onClick={() => { openTask(fixture.tasks[0]) }}>
          {t('open')}
        </Button>
      </div>
      <div className={css.dashboardBottom}>
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('upcoming')}</h2>
            <Button size="sm" onClick={() => { selectView('tasks') }}>
              {t('allTasks')}
            </Button>
          </div>
          <TaskRows compact />
        </section>
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('schedule')}</h2>
            <Button size="sm" onClick={() => { selectView('calendar') }}>
              {t('goCalendar')}
            </Button>
          </div>
          <div className={css.agenda}>
            <span>09:30</span>
            <div>
              <strong>{t('calendar.0')}</strong>
              <small>{t('nav.groups')}</small>
            </div>
            <span>14:00</span>
            <div>
              <strong>{t('calendar.2')}</strong>
              <small>{t('role.director')}</small>
            </div>
          </div>
          <Button onClick={() => { selectView('groups') }}>
            {t('goGroups')}
          </Button>
        </section>
      </div>
    </>
  )
}
