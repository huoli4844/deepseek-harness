/** Local rehearsal of assistant reviews and decision preparation for ECN-204. */
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChangeDemo } from './change-demo.ts'
import css from './Workbench.module.css'

interface ChangeDemoProps extends PropsLocale<'yuanshu.workbench'> {
  readonly demo: ChangeDemo | undefined
  readonly onEdit: (input: Pick<ChangeDemo, 'constraint' | 'model'>) => void
  readonly onOpenAnalysis: (() => void) | undefined
  readonly onRun: () => void
  readonly onDecision: () => void
}

/**
 * Show the saved instructions, simulated reports and options for the same change.
 * @param props - Local exercise state and callbacks to save, simulate and open the decision.
 * @returns The assistant exercise within the change record.
 */
export function ChangeDemoPanel({ t, demo, onEdit, onRun, onDecision, onOpenAnalysis }: ChangeDemoProps) {
  const constraint = demo?.constraint ?? ''
  const model = demo?.model ?? 'fast'
  const report = demo?.report
  const stale = report !== undefined && (report.constraint !== constraint || report.model !== model)
  return (
    <section className={css.projectOpsItem} aria-label={t('changeDemo.title')}>
      <div className={css.sectionHeading}>
        <h3>{t('changeDemo.title')}</h3>
        <Tag>{t('demoSample')}</Tag>
      </div>
      <p>{t('changeDemo.method')}</p>
      <p>{t('changeDemo.flow')}</p>
      <label className={css.field}>
        {t('changeDemo.constraint')}
        <textarea
          value={constraint}
          placeholder={t('changeDemo.placeholder')}
          onChange={(event) => { onEdit({ constraint: event.target.value, model }) }}
        />
      </label>
      <label className={css.projectDecisionSelect}>
        {t('changeDemo.model')}
        <select value={model} onChange={(event) => {
          onEdit({ constraint, model: event.target.value === 'detailed' ? 'detailed' : 'fast' })
        }}>
          <option value="fast">{t('changeDemo.fast')}</option>
          <option value="detailed">{t('changeDemo.detailed')}</option>
        </select>
      </label>
      <div className={css.assistantActions}>
        {onOpenAnalysis !== undefined && (
          <Button variant="primary" size="sm" onClick={onOpenAnalysis}>{t('changeDemo.openAnalysis')}</Button>
        )}
        <Button size="sm" onClick={onRun}>{t('changeDemo.run')}</Button>
        {demo !== undefined && <small>{t('changeDemo.saved')}</small>}
      </div>
      {report !== undefined && (
        <div className={css.projectOpsItem}>
          {stale && <p role="status">{t('changeDemo.previous')}</p>}
          <Tag>{t(report.model === 'fast' ? 'changeDemo.fast' : 'changeDemo.detailed')}</Tag>
          {report.constraint.trim() && (
            <dl className={css.methodFacts}>
              <dt>{t('changeDemo.applied')}</dt>
              <dd>{report.constraint}</dd>
            </dl>
          )}
          <h4>{t('changeDemo.schedule')}</h4>
          <p>{t('changeDemo.scheduleReport')}</p>
          <h4>{t('changeDemo.quality')}</h4>
          <p>{t('changeDemo.qualityReport')}</p>
          <h4>{t('changeDemo.compare')}</h4>
          <dl className={css.methodFacts}>
            <dt>{t('project.decision.fixture.option0')}</dt><dd>{t('changeDemo.optionA')}</dd>
            <dt>{t('project.decision.fixture.option2')}</dt><dd>{t('changeDemo.optionB')}</dd>
          </dl>
          <Button size="sm" disabled={stale} onClick={onDecision}>{t('changeDemo.decision')}</Button>
        </div>
      )}
    </section>
  )
}
