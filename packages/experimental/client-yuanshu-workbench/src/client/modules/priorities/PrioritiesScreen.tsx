/**
 * 经营优先级（导航项「priorities」）：按角色过滤的优先级清单，含指标、来源、
 * 方法链路与「打开」入口。从 Workbench.tsx 抽离。
 */
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { taskTitles } from '../../core/fixtures.ts'
import { methodFor } from '../../core/data/methodology-data.ts'
import { positionScenarios, workItemForScenario } from '../../core/data/scenario-data.ts'
import { prioritiesForRole, priorityAssignment, priorityItems } from '../../core/data/priorities-data.ts'
import { useWorkbenchPage, type WorkbenchT } from '../../app/page-api.ts'
import type { WorkbenchKey } from '../../core/locales/locales.ts'
import css from '../../app/Workbench.module.css'

/** 渲染经营优先级页。 */
export function PrioritiesScreen({ t }: { readonly t: WorkbenchT }) {
  const page = useWorkbenchPage()
  const { role, priorityFilter, setPriorityFilter, workStatus, statusLabel, openPriority } = page
  const visibleItems = priorityFilter === 'all' ? priorityItems : prioritiesForRole(role)
  return (
    <>
      <div className={css.priorityFilters} role="group" aria-label={t('priorities.title')}>
        <Button variant={priorityFilter === 'all' ? 'outline' : 'ghost'} aria-pressed={priorityFilter === 'all'} onClick={() => { setPriorityFilter('all') }}>
          {t('priorities.all')}
        </Button>
        <Button variant={priorityFilter === 'role' ? 'outline' : 'ghost'} aria-pressed={priorityFilter === 'role'} onClick={() => { setPriorityFilter('role') }}>
          {t('priorities.forRole')}
        </Button>
      </div>
      <section className={css.priorityList} aria-label={t('priorities.title')}>
        {visibleItems.map((item) => {
          const assignment = priorityAssignment(item, role) ?? item.assignments[0]
          if (assignment === undefined) return null
          const scenario = positionScenarios[assignment.role][assignment.kpiIndex]
          if (scenario === undefined) return null
          const workItem = workItemForScenario(assignment.role, assignment.kpiIndex)
          const method = methodFor(assignment.role, scenario.task)
          const status = workStatus(workItem.id, workItem.status)
          return (
            <article className={css.priorityRow} key={item.id}>
              <div className={css.priorityRank} aria-label={t('priorities.rank', { rank: item.rank })}>
                <strong>{String(item.rank).padStart(2, '0')}</strong>
              </div>
              <div className={css.priorityBody}>
                <div className={css.priorityTitleRow}>
                  <h2>{t(item.title)}</h2>
                  <Tag>{statusLabel(status)}</Tag>
                </div>
                <p className={css.priorityReason}>{t(item.reason)}</p>
                <div className={css.priorityFacts}>
                  <div>
                    <small>{t(`${assignment.role}.metric${assignment.kpiIndex + 1}` as WorkbenchKey)}</small>
                    <strong>{item.current}{item.unit === '%' ? '%' : ` ${item.unit}`}</strong>
                  </div>
                  <div>
                    <small>{t('priorities.target')}</small>
                    <strong>{item.target}{item.unit === '%' ? '%' : ` ${item.unit}`}</strong>
                  </div>
                  <div>
                    <small>{t('assistant.owner')}</small>
                    <strong>{t(`role.${assignment.role}`)}</strong>
                  </div>
                  <div>
                    <small>{t('assistant.due')}</small>
                    <strong>{t(item.dueKey)}</strong>
                  </div>
                </div>
                <div className={css.priorityTrace}>
                  <p><strong>{t('priorities.source')}:</strong> {t(item.source)}</p>
                  <p><strong>{t('assistant.nextAction')}:</strong> {t(item.action)}</p>
                  <small>{t('assistant.method')}: {t(method.method.title)} · {t(taskTitles[scenario.task])}</small>
                </div>
              </div>
              <div className={css.priorityAction}>
                <small>{t('priorities.participants', { count: item.assignments.length })}</small>
                <Button variant="outline" onClick={() => { openPriority(item) }}>
                  {t('priorities.open')}
                </Button>
              </div>
            </article>
          )
        })}
        {visibleItems.length === 0 && <p className={css.empty}>{t('priorities.noRoleItems')}</p>}
      </section>
      <p className={css.priorityDisclaimer}>{t('assistant.scopeHint')}</p>
    </>
  )
}
