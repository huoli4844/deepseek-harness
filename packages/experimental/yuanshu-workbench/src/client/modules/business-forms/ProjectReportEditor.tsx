/** 展示固定 A2UI 项目周报表单，不访问网络或维护批次状态。 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { BusinessFormModal } from '../../shared/BusinessFormModal.tsx'
import type { WorkbenchT } from '../../app/page-api.ts'
import { EDIT_TEMPLATE } from '../../../business-forms/templates/index.ts'
import { projectReportLabel } from './project-report-labels.ts'
import type { ProjectReportContent, ProjectReportDraft } from '../../../business-forms/project-report.ts'
import css from './business-forms.module.css'

/** 渲染经本地白名单验证的项目周报正文和人工操作。 */
export function ProjectReportEditor({ draft, content, t, busy, error, onCancel, onSubmit, onChange }: {
  readonly draft: ProjectReportDraft
  readonly content: ProjectReportContent
  readonly t: WorkbenchT
  readonly busy: boolean
  readonly error: string | undefined
  readonly onCancel: () => void
  readonly onSubmit: () => void
  readonly onChange: (key: keyof ProjectReportContent, value: string) => void
}) {
  const success = draft.state === 'submitted'
  const frozen = busy || success || draft.state === 'uncertain'
  const fields = draft.fields.filter(def => !def.unsupported)
  const unsupported = draft.fields.filter(def => def.unsupported)
  return <BusinessFormModal open title={draft.exportOnly ? t('projectReport.export') : t('projectReport.title', { project: draft.name })}
    closeLabel={t('projectReport.cancel')} contentClassName={css.modalContent ?? ''} maxWidth={EDIT_TEMPLATE.maxWidth}
    onClose={() => { if (!busy && !success) onCancel() }}>
    <div className={css.form}>
      <div className={css.body}>
        <p className={css.coverage}>{t('projectReport.period', { start: draft.start, end: draft.end })}</p>
        {draft.exportOnly ? <p>{t('projectReport.exportCount', { count: draft.total })}</p> : <>
          <p className={css.coverage}>{t('projectReport.position', { position: draft.position, total: draft.total })}</p>
          <div className={css.fields}>
            {fields.map((def, index) => <label key={def.key} className={css.field}>
              <span>{projectReportLabel(t, def)}</span>
              <textarea value={content[def.key] ?? ''} maxLength={def.maxLength ?? 8000} rows={3} disabled={frozen}
                data-modal-autofocus={index === 0 ? true : undefined}
                onChange={(event) => { onChange(def.key, event.currentTarget.value) }} />
            </label>)}
          </div>
          {unsupported.length > 0 && <p className={css.coverage}>
            {t('projectReport.unsupported', { fields: unsupported.map(def => projectReportLabel(t, def)).join('、') })}
          </p>}
        </>}
        {success && <p role="status">{t('projectReport.success', { project: draft.name })}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className={css.actions}>
        <Button size="sm" variant="outline" disabled={busy || success} onClick={onCancel}>{t('projectReport.cancel')}</Button>
        <Button size="sm" variant="primary" disabled={frozen} onClick={onSubmit}>
          {t(busy ? 'daily.busy' : draft.exportOnly ? 'projectReport.download' : 'projectReport.submit')}
        </Button>
      </div>
    </div>
  </BusinessFormModal>
}
