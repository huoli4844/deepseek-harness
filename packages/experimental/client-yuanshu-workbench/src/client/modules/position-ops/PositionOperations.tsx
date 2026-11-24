/** Evidence, decision and acceptance controls for a position operating scenario. */
import { useId, useState, type ReactNode } from 'react'
import { Button, Checkbox, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DemoFollowUp } from '../../core/model.ts'
import { positionSignals, type OperatingRole, type PositionCaseRecord } from '../../core/data/position-operations.ts'
import css from '../../app/Workbench.module.css'

interface PositionOperationsProps extends PropsLocale<'yuanshu.workbench'> {
  readonly role: OperatingRole
  readonly record: PositionCaseRecord | undefined
  readonly delivery: DemoFollowUp | undefined
  /** 「我的任务」区块（由外层工作台注入本岗位的任务行）。 */
  readonly myTasks?: ReactNode
  readonly onMethod: () => void
  readonly onGroup: (id: string) => void
  readonly onDispatch: (option: 0 | 1, assignment: string) => void
  readonly onReview: (
    note: string,
    outcome: 'accepted' | 'rework',
    checks: readonly [boolean, boolean],
  ) => void
}

const steps = ['signal', 'decision', 'delivery', 'review'] as const
const options = [0, 1] as const

/**
 * Show one operating scenario with its own evidence comparison and handoff.
 * @param props - The position, its persisted decision and handoff, and navigation and review actions.
 * @returns The operating scenario and its available actions.
 */
export function PositionOperations({
  t,
  role,
  record,
  delivery,
  myTasks,
  onMethod,
  onGroup,
  onDispatch,
  onReview,
}: PositionOperationsProps) {
  const id = useId()
  const [option, setOption] = useState<0 | 1>()
  const [note, setNote] = useState('')
  const [checks, setChecks] = useState<readonly [boolean, boolean]>([false, false])
  const signal = positionSignals[role]
  const status = record?.status ?? 'attention'
  const currentStep = { attention: 'decision', waiting: 'delivery', rework: 'delivery', review: 'review', accepted: undefined }[status]
  const plan = record === undefined ? undefined : t(`position.${role}.option${record.option}`)
  const due = t('task.tomorrow')
  const artifact = t(`position.${role}.artifact`)
  const maxValue = signal.unit === 'percent' ? 100 : Math.max(signal.current, signal.target)
  const measurements = [
    { label: 'position.current', value: signal.current },
    { label: 'position.target', value: signal.target },
  ] as const
  const dispatch = () => {
    if (option === undefined) return
    onDispatch(option, t('position.summary', { plan: t(`position.${role}.option${option}`), artifact, due }))
  }
  const review = (outcome: 'accepted' | 'rework') => {
    onReview(note.trim(), outcome, checks)
    setNote('')
    setChecks([false, false])
  }

  return (
    <>
      <section className={css.positionSop} aria-labelledby={`${id}-sop`}>
        <div className={css.sectionHeading}>
          <h2 id={`${id}-sop`}>{t('position.sop')}</h2>
          <Button size="sm" onClick={onMethod}>{t('position.method')}</Button>
        </div>
        <ol>
          {steps.map(step => (
            <li key={step} aria-current={step === currentStep ? 'step' : undefined}>
              {t(`position.step.${step}`)}
            </li>
          ))}
        </ol>
      </section>
      {/* 我的任务：原独立菜单页已并入岗位运营。 */}
      {myTasks !== undefined && (
        <section className={css.card} aria-labelledby={`${id}-tasks`}>
          <div className={css.sectionHeading}>
            <h2 id={`${id}-tasks`}>{t('position.myTasks')}</h2>
          </div>
          {myTasks}
        </section>
      )}
      <div className={css.positionGrid}>
        <section className={css.card} aria-labelledby={`${id}-metric`}>
          <div className={css.sectionHeading}>
            <h2 id={`${id}-metric`}>{t(signal.metric)}</h2>
            <Tag>{t('demoSample')}</Tag>
          </div>
          <dl className={css.positionComparison}>
            {measurements.map(({ label, value }) => (
              <div key={label}>
                <dt>{t(label)}</dt>
                <dd>{t(`position.unit.${signal.unit}`, { value })}</dd>
                <div className={css.barTrack} aria-hidden="true">
                  <span style={{ width: `${100 * value / maxValue}%` }} />
                </div>
              </div>
            ))}
          </dl>
          <dl className={css.methodFacts}>
            <dt>{t('position.source')}</dt><dd>{t(`position.${role}.source`)}</dd>
            <dt>{t('position.recipient')}</dt><dd>{t(`role.${signal.recipient}`)}</dd>
            <dt>{t('position.deadline')}</dt><dd>{due}</dd>
            <dt>{t('position.delivery')}</dt><dd>{artifact}</dd>
          </dl>
        </section>
        <section className={css.card} aria-labelledby={`${id}-decision`}>
          <h2 id={`${id}-decision`}>{t('position.options')}</h2>
          {plan === undefined ? (
            <>
              <fieldset className={css.positionOptions}>
                <legend>{t('position.select')}</legend>
                {options.map(index => (
                  <label key={index} className={css.positionOption}>
                    <input type="radio" name={`${id}-plan`} checked={option === index} onChange={() => { setOption(index) }} />
                    <span>
                      <strong>{t(`position.${role}.option${index}`)}</strong>
                      {index === signal.recommended && <small>{t('position.recommended')}</small>}
                      <small>{t(`position.${role}.tradeoff${index}`)}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <Button variant="primary" disabled={option === undefined} onClick={dispatch}>{t('position.dispatch')}</Button>
            </>
          ) : (
            <div className={css.positionPlan}>
              <p>{t('position.selected')}</p>
              <strong>{plan}</strong>
              {delivery?.groupId !== undefined && (
                <Button variant="outline" onClick={() => { if (delivery.groupId !== undefined) onGroup(delivery.groupId) }}>
                  {t('position.openWorkgroup')}
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
      <section className={css.card} aria-labelledby={`${id}-review`}>
        <h2 id={`${id}-review`}>{t('position.review')}</h2>
        {delivery?.response && (
          <dl className={`${css.methodFacts} ${css.positionReviewEvidence}`}>
            <dt>{t('groups.responseRecorded')}</dt><dd>{delivery.response}</dd>
          </dl>
        )}
        {status === 'review' ? (
          <div className={css.positionReview}>
            <p className={css.intro}>{t('position.reviewHint')}</p>
            {options.map(index => (
              <Checkbox
                key={index}
                checked={checks[index]}
                label={t(`position.${role}.criterion${index}`)}
                onChange={(checked) => { setChecks(index === 0 ? [checked, checks[1]] : [checks[0], checked]) }}
              />
            ))}
            <label className={css.field}>
              {t('position.note')}
              <textarea value={note} onChange={(event) => { setNote(event.target.value) }} />
            </label>
            <p className={css.intro}>{t('position.checkHint')}</p>
            <div className={css.assistantActions}>
              <Button variant="outline" disabled={!note.trim()} onClick={() => { review('rework') }}>{t('position.rework')}</Button>
              <Button variant="primary" disabled={!note.trim() || !checks.every(Boolean)} onClick={() => { review('accepted') }}>
                {t('position.accept')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ul className={css.projectCriteria}>
              {options.map(index => <li key={index}>{t(`position.${role}.criterion${index}`)}</li>)}
            </ul>
            {record?.status === 'accepted' && <p className={css.notice}>{record.note}</p>}
            {record?.status === 'rework' && <p className={css.notice}>{t('position.returned', { note: record.note })}</p>}
            {record?.status === 'waiting' && <p className={css.intro}>{t('position.waiting')}</p>}
          </>
        )}
      </section>
    </>
  )
}
