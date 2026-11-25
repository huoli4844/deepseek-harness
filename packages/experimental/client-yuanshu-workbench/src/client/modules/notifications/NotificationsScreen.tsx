/**
 * 通知中心（并入「待办事项」页）：分类型的演示通知流 —— 项目 / 邮件 / 会议 / 付款 / 待审批。
 * 支持按类型筛选、未读标记、全部标为已读与跳转。
 */
import { useMemo, useState } from 'react'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import { taskTitles } from '../../core/fixtures.ts'
import { useWorkbenchPage, type WorkbenchT } from '../../app/page-api.ts'
import type { WorkbenchKey } from '../../core/locales/locales.ts'
import css from '../../app/Workbench.module.css'

/** 通知类型：项目 / 邮件 / 会议 / 付款 / 待审批。 */
type NotificationCategory = 'project' | 'mail' | 'meeting' | 'payment' | 'approval'

/** 类型 → 名称文案 key。 */
const CATEGORY_NAME_KEYS: Record<NotificationCategory, WorkbenchKey> = {
  project: 'notifications.cat.project',
  mail: 'notifications.cat.mail',
  meeting: 'notifications.cat.meeting',
  payment: 'notifications.cat.payment',
  approval: 'notifications.cat.approval',
}

/** 类型 → 标签配色：项目蓝、会议琥珀、付款绿、待审批红、邮件中性。 */
const CATEGORY_TONE: Record<NotificationCategory, TagTone> = {
  project: 'info',
  mail: 'neutral',
  meeting: 'warning',
  payment: 'success',
  approval: 'danger',
}

/** 演示通知清单：id 对应 notification.{id} 文案键；标题与时间围绕工程日历演示事项分布。 */
const NOTIFICATIONS: readonly { readonly id: number; readonly category: NotificationCategory; readonly time: string }[] = [
  { id: 0, category: 'project', time: '今天 09:12' },
  { id: 1, category: 'project', time: '今天 10:35' },
  { id: 2, category: 'meeting', time: '今天 11:00' },
  { id: 3, category: 'project', time: '昨天 17:20' },
  { id: 4, category: 'mail', time: '昨天 15:48' },
  { id: 5, category: 'approval', time: '昨天 14:00' },
  { id: 6, category: 'payment', time: '11-22 16:30' },
  { id: 7, category: 'approval', time: '11-22 10:00' },
  { id: 8, category: 'meeting', time: '11-21 18:00' },
  { id: 9, category: 'mail', time: '11-21 09:30' },
]

/** 渲染通知中心页。 */
export function NotificationsScreen({ t }: { readonly t: WorkbenchT }) {
  const page = useWorkbenchPage()
  const { state, actions, fixture, openTask } = page
  // 类型筛选档位：全部或某一通知类型。
  const [filter, setFilter] = useState<'all' | NotificationCategory>('all')
  const rows = useMemo(() => filter === 'all'
    ? NOTIFICATIONS
    : NOTIFICATIONS.filter(item => item.category === filter), [filter])
  const countOf = (category: NotificationCategory): number =>
    NOTIFICATIONS.reduce((total, item) => item.category === category ? total + 1 : total, 0)
  const categories = Object.keys(CATEGORY_NAME_KEYS) as NotificationCategory[]
  return (
    <>
      <div className={css.sectionHeading}>
        <p className={css.intro}>{t('notifications.intro')}</p>
        <Button onClick={() => { actions.markAllRead() }}>
          {t('notifications.readAll')}
        </Button>
      </div>
      {/* 类型筛选：全部 + 项目 / 邮件 / 会议 / 付款 / 待审批，计数随档位展示。 */}
      <div className={css.notifFilters} role="group" aria-label={t('notifications.filterLabel')}>
        <button
          type="button"
          className={filter === 'all' ? css.notifFilterActive : css.notifFilter}
          aria-pressed={filter === 'all'}
          onClick={() => { setFilter('all') }}
        >
          {t('notifications.filterAll')} · {NOTIFICATIONS.length}
        </button>
        {categories.map(category => (
          <button
            key={category}
            type="button"
            className={filter === category ? css.notifFilterActive : css.notifFilter}
            aria-pressed={filter === category}
            onClick={() => { setFilter(category) }}
          >
            {t(CATEGORY_NAME_KEYS[category])} · {countOf(category)}
          </button>
        ))}
      </div>
      <section className={css.card}>
        {rows.length === 0 && <p className={css.intro}>{t('notifications.empty')}</p>}
        {rows.map((item) => {
          const read = state.read.includes(item.id)
          return (
            <article key={item.id} className={css.notification}>
              <span className={read ? css.readDot : css.unreadDot} />
              <Tag tone={CATEGORY_TONE[item.category]}>{t(CATEGORY_NAME_KEYS[item.category])}</Tag>
              <div className={css.grow}>
                <h3>{t(`notification.${item.id}` as WorkbenchKey)}</h3>
                <p>
                  {item.category === 'project' && `${t(taskTitles[fixture.tasks[0]])} · `}
                  {item.time}
                </p>
              </div>
              <Tag>{t(read ? 'notifications.read' : 'notifications.unread')}</Tag>
              <Button
                onClick={() => {
                  actions.markRead(item.id)
                  openTask(fixture.tasks[0])
                }}
              >
                {t('open')}
              </Button>
              {!read && (
                <Button
                  onClick={() => {
                    actions.markRead(item.id)
                  }}
                >
                  {t('notifications.mark')}
                </Button>
              )}
            </article>
          )
        })}
      </section>
    </>
  )
}
