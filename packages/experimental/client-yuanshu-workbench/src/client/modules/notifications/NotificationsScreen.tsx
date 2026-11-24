/**
 * 通知中心（导航项「notifications」）：三条演示通知的已读标记与跳转。
 * 从 Workbench.tsx 抽离。
 */
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { taskTitles } from '../../core/fixtures.ts'
import { useWorkbenchPage, type WorkbenchT } from '../../app/page-api.ts'
import type { WorkbenchKey } from '../../core/locales/locales.ts'
import css from '../../app/Workbench.module.css'

/** 渲染通知中心页。 */
export function NotificationsScreen({ t }: { readonly t: WorkbenchT }) {
  const page = useWorkbenchPage()
  const { state, actions, fixture, openTask } = page
  return (
    <>
      <div className={css.sectionHeading}>
        <p className={css.intro}>{t('notifications.intro')}</p>
        <Button onClick={() => { actions.markAllRead() }}>
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
}
