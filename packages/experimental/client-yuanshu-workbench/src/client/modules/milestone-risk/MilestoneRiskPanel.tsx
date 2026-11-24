/** Walkthrough from a proactive milestone alert to verified closure. */
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { milestoneDemo, type MilestonePhase } from '../../core/data/milestone-risk.ts'
import css from '../../app/Workbench.module.css'

function focusHeading(element: HTMLHeadingElement | null): void {
  element?.focus()
}

interface Props extends PropsLocale<'yuanshu.workbench'> {
  readonly phase: MilestonePhase
  readonly advance: (phase: MilestonePhase) => void
  readonly onClose: () => void
  readonly askAssistant: (prompt: string) => void
}

/**
 * Render the evidence and the action permitted by the current phase.
 * @param props - Current mock phase and workbench actions.
 * @returns The milestone risk details and decision record.
 */
export function MilestoneRiskPanel({ t, phase, advance, onClose, askAssistant }: Props) {
  const analyzed = phase !== 'alert'
  const approved = analyzed && phase !== 'analyzed'
  const dispatched = phase === 'tracking' || phase === 'closed'
  const action = {
    alert: 'milestone.analyze',
    analyzed: 'milestone.approve',
    approved: 'milestone.dispatch',
    tracking: 'milestone.close',
    closed: undefined,
  } as const
  const next = action[phase]
  const phaseLabel = phase === 'alert' ? t('milestone.next.alert') : phase === 'analyzed' ? t('milestone.next.analyzed') : phase === 'approved' ? t('milestone.next.approved') : phase === 'tracking' ? t('milestone.next.tracking') : t('milestone.next.closed')
  const afterLabel = phase === 'alert' ? t('milestone.after.alert') : phase === 'analyzed' ? t('milestone.after.analyzed') : phase === 'approved' ? t('milestone.after.approved') : phase === 'tracking' ? t('milestone.after.tracking') : t('milestone.after.closed')

  return <section className={css.homeLane} aria-label={t('milestone.title')}>
    <div className={css.sectionHeading}>
      <h2 tabIndex={-1} ref={focusHeading}>{t('milestone.title')}</h2>
      <Tag>{t('demoSample')}</Tag>
      <Button variant="outline" size="sm" onClick={onClose}>{t('close')}</Button>
    </div>
    <p>{t('milestone.trigger')}</p>
    <div className={css.homeBrief}>
      <p className={css.eyebrow}>{t('milestone.current')} · {phase}</p>
      <h3>{t('milestone.next')}</h3>
      <p>{phaseLabel}</p>
      <small>{t('milestone.after')}：{afterLabel}</small>
      {next !== undefined && <div className={css.assistantActions}><Button variant="primary" onClick={() => {
        askAssistant(t('milestone.assistantPrompt'))
        advance(phase)
      }}>{t(next)}</Button></div>}
    </div>
    {analyzed && <>
      <h3>{t('milestone.report')}</h3>
      <p>{t('milestone.impact')}</p>
      <ul>{milestoneDemo.evidence.map(record => <li key={record}>{record}</li>)}</ul>
      <p>{t('milestone.recommend')}</p>
      <p>{t('milestone.alternative')}</p>
    </>}
    {dispatched && <>
      <p>{t('milestone.tracking')}</p>
      <p>{t('milestone.verify')}</p>
    </>}
    {phase === 'closed' && <p role="status">{t('milestone.closed')}</p>}
    {analyzed && <>
      <h3>{t('milestone.audit')}</h3>
      <ol>
        <li>{t('milestone.logAnalysis')}</li>
        {approved && <li>{t('milestone.logApproval')}</li>}
        {dispatched && <li>{t('milestone.logDispatch')}</li>}
        {phase === 'closed' && <li>{t('milestone.logClosure')}</li>}
      </ol>
    </>}
  </section>
}
