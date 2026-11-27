/** 受限 A2UI 展示层：只渲染本地输入组件与注册动作，不访问网络或管理状态。 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { BusinessFormModal } from '../../shared/BusinessFormModal.tsx'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { DailyContent, DailyField } from '../../../business-forms/model.ts'
import type { DailyFormView } from './model.ts'
import css from './business-forms.module.css'

/** 展示受控日报弹窗，所有数据写入由容器回调完成。 */
export function BusinessForm({ view, content, busy, frozen, allowCloseWhenFrozen, error, ready, t, onChange, onAction }: {
  readonly view: DailyFormView
  readonly content: DailyContent
  readonly busy: boolean
  readonly frozen: boolean
  readonly allowCloseWhenFrozen?: boolean
  readonly error: Parameters<WorkbenchT>[0] | undefined
  readonly ready: boolean
  readonly t: WorkbenchT
  readonly onChange: (key: DailyField, value: string) => void
  readonly onAction: (action: 'save' | 'submit' | 'cancel' | 'retry') => void
}) {
  return <BusinessFormModal open title={t('daily.title')} closeLabel={t('daily.cancel')}
    maxWidth={view.template.maxWidth} contentClassName={css.modalContent ?? ''}
    onClose={() => { if (!busy && (!frozen || allowCloseWhenFrozen)) onAction('cancel') }}>
    <div className={css.form}>
      <div className={css.body}>
        <div className={css.metadata}><span>{t('daily.date')}</span><time dateTime={view.form.work_date}>{view.form.work_date}</time></div>
        <p className={css.coverage}>{t('daily.coverage')}</p>
        <p className={css.coverage}>{t('daily.evidence', { count: view.form.evidence_refs.length })}</p>
        <div className={css.fields}>
          {view.fields.map((item, index) => <label key={item.key} className={css.field}>
            <span>{t(item.label)}</span>
            <textarea name={item.key} value={content[item.key]} rows={3} disabled={busy || frozen}
              data-modal-autofocus={index === 0 ? true : undefined}
              onChange={(event) => { onChange(item.key, event.currentTarget.value) }} />
          </label>)}
        </div>
        <div className={css.notice} aria-live="polite">
          {error ? <p role="alert">{t(error)}</p> : !ready ? <p>{t('daily.required')}</p> : null}
        </div>
      </div>
      <div className={css.actions}>
        <Button size="sm" variant="outline" disabled={busy || (frozen && !allowCloseWhenFrozen)} onClick={() => { onAction('cancel') }}>{t('daily.cancel')}</Button>
        {frozen ? <Button size="sm" variant="primary" disabled={busy} onClick={() => { onAction('retry') }}>{t(busy ? 'daily.busy' : 'daily.retry')}</Button>
          : <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { onAction('save') }}>{t('daily.save')}</Button>
            <Button size="sm" variant="primary" disabled={busy || !ready} onClick={() => { onAction('submit') }}>{t(busy ? 'daily.busy' : 'daily.submit')}</Button>
          </>}
      </div>
    </div>
  </BusinessFormModal>
}
