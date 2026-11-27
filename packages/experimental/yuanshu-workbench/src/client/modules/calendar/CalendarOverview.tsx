/**
 * 日历概览：本周工作事项 + 当天事项，嵌入岗位工作台。
 * 与日历页共用同一份事项数据（本地事项 localStorage + 后台只读日程）。
 */
import { useMemo } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { taskTitles } from '../../core/fixtures.ts'
import type { TaskId } from '../../core/model.ts'
import { isoOf, useCalendarItems } from './calendar-shared.ts'
import { CalendarItemForm } from './CalendarItemForm.tsx'
import css from './Calendar.module.css'

type WorkbenchT = PropsLocale<'yuanshu.workbench'>['t']

/** 状态首字母大写，拼出对应的圆点样式类名。 */
const dotClass = (status: string) => `dot${status.charAt(0).toUpperCase()}${status.slice(1)}`

/** 渲染岗位工作台上的本周与当天事项卡片。 */
export function CalendarOverview({ t }: { readonly t: WorkbenchT }) {
  const { allItems, form, draft, setDraft, openAdd, openEdit, closeForm, saveItem, removeItem } = useCalendarItems()
  const todayIso = useMemo(() => isoOf(new Date()), [])

  /** 今天所在自然周的周一与周日。 */
  const weekStartIso = useMemo(() => {
    const date = new Date(`${todayIso}T00:00:00`)
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
    return isoOf(date)
  }, [todayIso])
  const weekEndIso = useMemo(() => {
    const date = new Date(`${weekStartIso}T00:00:00`)
    date.setDate(date.getDate() + 6)
    return isoOf(date)
  }, [weekStartIso])

  const weekItems = useMemo(() => allItems
    .filter(item => item.date >= weekStartIso && item.date <= weekEndIso)
    .sort((a, b) => a.date === b.date
      ? (a.time ?? '99:99').localeCompare(b.time ?? '99:99')
      : a.date.localeCompare(b.date)), [allItems, weekStartIso, weekEndIso])
  const dayItems = useMemo(() => allItems
    .filter(item => item.date === todayIso)
    .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99')), [allItems, todayIso])

  const taskOptions = useMemo(() => (Object.keys(taskTitles) as TaskId[]).map(id => ({
    id,
    label: t(taskTitles[id]),
  })), [t])

  return <>
    <div className={css.overview}>
      <section className={css.asideCard} aria-label={t('calendar.weekTitle')}>
        <div className={css.asideHead}>
          <div>
            <small className={css.asideDate}>{weekStartIso} ~ {weekEndIso}</small>
            <h3>{t('calendar.weekTitle')}</h3>
          </div>
        </div>
        {weekItems.length === 0
          ? <div className={css.asideEmpty}>
            <span aria-hidden>◦ ◦ ◦</span>
            <p>{t('calendar.weekEmpty')}</p>
          </div>
          : <ul className={css.planList}>
            {weekItems.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${css.planRow} ${item.status === 'completed' ? css.planDone : ''} ${item.readonly ? css.planReadonly : ''}`}
                  onClick={() => { openEdit(item) }}
                >
                  <span className={`${css.planDot} ${css[dotClass(item.status)] ?? ''}`} aria-hidden />
                  <small>{item.date.slice(5)}</small>
                  {item.time !== undefined && <small>{item.time}</small>}
                  <span className={css.planTitleText}>{item.title}</span>
                </button>
              </li>
            ))}
          </ul>}
      </section>

      <section className={css.asideCard} aria-label={t('calendar.planTitle')}>
        <div className={css.asideHead}>
          <div>
            <small className={css.asideDate}>{todayIso}</small>
            <h3>{t('calendar.planTitle')}</h3>
          </div>
          <button
            type="button"
            className={css.asideAdd}
            aria-label={t('calendar.addOn', { date: todayIso })}
            onClick={() => { openAdd(todayIso) }}
          >+</button>
        </div>
        {dayItems.length === 0
          ? <div className={css.asideEmpty}>
            <span aria-hidden>◦ ◦ ◦</span>
            <p>{t('calendar.planEmpty')}</p>
          </div>
          : <ul className={css.planList}>
            {dayItems.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${css.planRow} ${item.status === 'completed' ? css.planDone : ''} ${item.readonly ? css.planReadonly : ''}`}
                  onClick={() => { openEdit(item) }}
                >
                  <span className={`${css.planDot} ${css[dotClass(item.status)] ?? ''}`} aria-hidden />
                  {item.time !== undefined && <small>{item.time}</small>}
                  <span className={css.planTitleText}>{item.title}</span>
                </button>
              </li>
            ))}
          </ul>}
      </section>
    </div>
    <CalendarItemForm
      t={t}
      form={form}
      draft={draft}
      setDraft={setDraft}
      taskOptions={taskOptions}
      onSave={saveItem}
      onRemove={removeItem}
      onClose={closeForm}
    />
  </>
}
