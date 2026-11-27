/**
 * 任务工作台（导航项「work」）：四阶段 SOP 执行、证据/分析录入、草稿与版本、
 * 验证完成与 AI 侧栏。从 Workbench.tsx 抽离。
 */
import { Button, Checkbox, Tag, IconChevronRightOutlineRegular, IconLayersOutlineRegular, IconPaperclipOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { useWorkbenchPage, type WorkbenchT } from '../../app/page-api.ts'
import type { WorkbenchKey } from '../../core/locales/locales.ts'
import { MethodChecks } from '../../app/page-parts.tsx'
import css from '../../app/Workbench.module.css'

const STAGE_LABELS = ['stage.materials', 'stage.analysis', 'stage.result', 'stage.review'] as const
const NEXT_STAGE_LABELS = ['stage.analysis', 'stage.result', 'stage.review'] as const

/** 渲染任务工作台页。 */
export function TaskWorkScreen({ t }: { readonly t: WorkbenchT }) {
  const page = useWorkbenchPage()
  const {
    state, actions, role, fixture, taskKey, draft, execution, text, versions, initial, suggestedStructure,
    currentTitle, method, practice, stage, statusLabel, currentWorkItem,
    currentWorkStatus, sourceMetric, taskDeliveries, candidate, setCandidate, setSourceIndex, setDialog,
    setFeedback, setWorkStage, selectView, openWorkgroup, openRoleConversation,
  } = page
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { page.selectView('assistant') }}>{t('home.back')}</Button>
      <section className={css.workContext} aria-label={t('home.workContext')}>
        <dl className={css.methodFacts}>
          {currentWorkItem !== undefined && (
            <><dt>{t('home.trigger')}</dt><dd>{t(`home.${role}.trigger${currentWorkItem.metricIndex}`)}</dd></>
          )}
          {sourceMetric !== undefined && (
            <><dt>{t('home.relatedMetric')}</dt><dd>{t(`${role}.metric${sourceMetric + 1}` as WorkbenchKey)} · {fixture.metrics[sourceMetric]}</dd></>
          )}
          <dt>{t('guide.output')}</dt><dd>{t(practice.output)}</dd>
          <dt>{t('guide.acceptance')}</dt><dd>{t(practice.acceptance)}</dd>
        </dl>
      </section>
      <nav className={css.workFlow} aria-label={t('assistant.sopFlow', { task: currentTitle })}>
        <div className={css.sectionHeading}>
          <h2>{t(method.title)}</h2>
          <Tag>{t('guide.progress', { done: execution.checked.length })}</Tag>
        </div>
        <ol className={css.stages}>
          {([0, 1, 2, 3] as const).map(index => (
            <li key={index}>
              <Button
                aria-current={stage === index ? 'step' : undefined}
                variant={stage === index ? 'outline' : 'ghost'}
                onClick={() => { setWorkStage(index) }}
              >
                {index + 1} · {t(STAGE_LABELS[index])}
              </Button>
            </li>
          ))}
        </ol>
      </nav>
      <div className={css.workLayout}>
        <section className={css.card}>
          <div className={css.methodStep}>
            <small>{t('guide.title')}</small>
            <h2>{t(method.steps[stage].title)}</h2>
            <p>{t(method.steps[stage].prompt)}</p>
            <dl className={css.methodFacts}>
              <dt>{t(stage === 0 ? 'guide.inputs' : stage === 1 || stage === 3 ? 'guide.acceptance' : 'guide.output')}</dt>
              <dd>{t(stage === 0 ? practice.inputs : stage === 1 || stage === 3 ? practice.acceptance : practice.output)}</dd>
            </dl>
          </div>
          {stage === 0 ? (
            <>
              <h2>{t('work.evidence')}</h2>
              {[0, 1, 2].map(id => (
                <button
                  className={css.source}
                  key={id}
                  onClick={() => {
                    setSourceIndex(id)
                    setDialog('source')
                  }}
                >
                  <IconPaperclipOutlineRegular size={18} />
                  {t(`${role}.source${id}` as WorkbenchKey)}
                  <IconChevronRightOutlineRegular size={14} />
                </button>
              ))}
              <label className={css.field}>
                {t('guide.evidence')}
                <textarea value={execution.evidence} onChange={(e) => {
                  actions.recordMethod(taskKey, 'evidence', e.target.value, initial)
                }} />
              </label>
            </>
          ) : stage === 1 ? (
            <>
              <h2>{t('analysis.title')}</h2>
              <p className={css.intro}>{t('analysis.body')}</p>
              <p className={css.notice}>{t(`${role}.warning`)}</p>
              <label className={css.field}>
                {t('guide.analysis')}
                <textarea value={execution.analysis} onChange={(e) => {
                  actions.recordMethod(taskKey, 'analysis', e.target.value, initial)
                }} />
              </label>
            </>
          ) : stage === 3 ? (
            <>
              <h2>{t('stage.review')}</h2>
              <p className={css.intro}>{t(draft?.submitted ? 'work.submitted' : 'work.reviewNote')}</p>
              <section className={css.verification} aria-label={t('assistant.verification')}>
                <div className={css.sectionHeading}>
                  <div><h2>{t('assistant.verification')}</h2><p className={css.intro}>{t('assistant.verificationHint')}</p></div>
                  {currentWorkStatus !== undefined && <Tag>{statusLabel(currentWorkStatus)}</Tag>}
                </div>
                {taskDeliveries.map((item) => {
                  if (item.groupId === undefined || !item.done || item.response === undefined) return null
                  const groupId = item.groupId
                  return (
                    <article className={css.homeRow} key={item.id}>
                      <div>
                        <h3>{t('groups.responseRecorded')} · {t(`role.${item.role}`)}</h3>
                        <p>{item.response}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => { openWorkgroup(groupId, item.id) }}>
                        {t('nav.groups')}
                      </Button>
                    </article>
                  )
                })}
                <label className={css.field}>
                  {t('assistant.resultStatus')}
                  <textarea
                    placeholder={t('assistant.verificationPlaceholder')}
                    readOnly={currentWorkStatus === 'done'}
                    value={state.verifications[currentWorkItem?.id ?? ''] ?? ''}
                    onChange={(event) => {
                      if (currentWorkItem !== undefined) actions.saveVerification(currentWorkItem.id, event.target.value)
                    }}
                  />
                </label>
                {currentWorkStatus === 'review' && <p className={css.intro}>{t('assistant.awaitingReview')}</p>}
                {currentWorkStatus === 'done' && <p className={css.intro}>{t('assistant.completedAt')}</p>}
                {currentWorkItem !== undefined && currentWorkStatus !== 'done' && (
                  <Button
                    variant="primary"
                    disabled={currentWorkStatus !== 'review' || !(state.verifications[currentWorkItem.id] ?? '').trim()
                      || taskDeliveries.some(item => !item.done)}
                    onClick={() => {
                      actions.setWorkStatus(currentWorkItem.id, 'done')
                      setFeedback(t('assistant.completedAt'))
                    }}
                  >
                    {t('assistant.complete')}
                  </Button>
                )}
              </section>
              <MethodChecks />
              <label className={css.field}>
                {t('work.comment')}
                <textarea
                  value={draft?.comment ?? ''}
                  onChange={(e) => {
                    actions.comment(taskKey, e.target.value, initial)
                  }}
                />
              </label>
              <Button
                onClick={() => {
                  setFeedback(t('work.commentSave'))
                }}
              >
                {t('work.commentSave')}
              </Button>
            </>
          ) : (
            <>
              <div className={css.sectionHeading}>
                <h2>{currentTitle}</h2>
                <Button
                  size="sm"
                  aria-label={t('versions.open', { count: versions.length })}
                  onClick={() => {
                    selectView('versions')
                  }}
                >
                  {t('versionNumber', { number: versions.length })}
                </Button>
              </div>
              <p className={css.intro}>{t('work.context')}</p>
              <p className={css.notice}>{t(`${role}.warning`)}</p>
              <label className={css.field}>
                {t('work.draft')}
                <textarea
                  value={text}
                  onChange={(e) => {
                    actions.editDraft(taskKey, e.target.value, initial)
                  }}
                />
              </label>
              <div className={css.sectionHeading}>
                <small>{t('draftOnly')}</small>
                <div className={css.assistantActions}>
                  <Button variant="outline" onClick={() => {
                    actions.saveDraft(taskKey, initial)
                    setFeedback(t('work.saved'))
                  }}>{t('work.save')}</Button>
                  {currentWorkStatus !== 'done' && (
                    <Button variant="primary" disabled={!text.trim() || draft?.submitted}
                      onClick={() => { setDialog('submit') }}>{t(draft?.submitted ? 'work.submitted' : 'work.submit')}</Button>
                  )}
                </div>
              </div>
            </>
          )}
          {stage !== 3 && <div className={css.methodChecks}>
            <Checkbox checked={execution.checked.includes(stage)} label={t('guide.stageDone')}
              onChange={(checked) => { actions.checkMethod(taskKey, stage, checked, initial) }} />
            <Button variant="outline" onClick={() => { setWorkStage(stage === 0 ? 1 : stage === 1 ? 2 : 3) }}>
              {t(NEXT_STAGE_LABELS[stage])}
              <IconChevronRightOutlineRegular size={14} />
            </Button>
          </div>}
          <p className={css.intro}>{t('guide.recordHint')}</p>
        </section>
        <aside className={css.card} aria-label={t('work.ai')}>
          <div className={css.sectionHeading}>
            <h2>{t('work.ai')}</h2>
            <IconLayersOutlineRegular size={18} />
          </div>
          <p className={css.intro}>{t('work.aiHint')}</p>
          <Button variant="primary" onClick={() => { openRoleConversation() }}>{t('conversation.open')}</Button>
          <p>{t(method.why)}</p>
          {!candidate && currentWorkStatus !== 'done' && (
            <Button variant="outline" onClick={() => { setCandidate(true) }}>{t('work.aiAsk')}</Button>
          )}
          {candidate && currentWorkStatus !== 'done' && (
            <div className={css.candidate}>
              <h3>{t('work.aiCandidate')}</h3>
              <p>{suggestedStructure}</p>
              <Button
                variant="primary"
                disabled={text !== initial && text.trim() !== ''}
                onClick={() => {
                  actions.editDraft(taskKey, suggestedStructure, initial)
                  setCandidate(false)
                  setWorkStage(2)
                }}
              >
                {t('work.adopt')}
              </Button>
              <Button
                onClick={() => {
                  setCandidate(false)
                }}
              >
                {t('work.dismiss')}
              </Button>
              {text !== initial && text.trim() !== '' && <p>{t('home.draftProtected')}</p>}
            </div>
          )}
          <label className={css.sceneHandoffField}>
            {t('scene.handoff')}
            <textarea
              value={page.state.sceneCheckpoints[taskKey]?.note ?? ''}
              placeholder={t('scene.handoffPlaceholder')}
              onChange={(event) => { actions.saveSceneNote(taskKey, event.target.value) }}
            />
          </label>
        </aside>
      </div>
    </>
  )
}
