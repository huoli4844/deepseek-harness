/**
 * 版本记录（导航项「versions」，从工作页进入）：草稿版本列表与对比入口。
 * 从 Workbench.tsx 抽离。
 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { taskTitles } from '../../core/fixtures.ts'
import { useWorkbenchPage, type WorkbenchT } from '../../app/page-api.ts'
import css from '../../app/Workbench.module.css'

/** 渲染版本记录页。 */
export function VersionsScreen({ t }: { readonly t: WorkbenchT }) {
  const page = useWorkbenchPage()
  const {
    state, actions, role, fixture, versions, currentTitle, method, setSelectedVersion, setDialog, openTask,
  } = page
  return (
    <>
      <p className={css.intro}>{t('versions.intro')}</p>
      <div className={css.versionSelect}>
        {fixture.tasks.map(id => (
          <Button
            key={id}
            variant={state.task === id ? 'outline' : 'ghost'}
            onClick={() => {
              actions.openTask(id)
              actions.navigate('versions')
            }}
          >
            {t(taskTitles[id])}
          </Button>
        ))}
      </div>
      <section className={css.card}>
        <h2>{currentTitle}</h2>
        <p className={css.intro}>{t(`role.${role}`)}</p>
        {versions.toReversed().map(v => (
          <div className={css.versionRow} key={v.number}>
            <span className={css.versionBadge}>{t('versionNumber', { number: v.number })}</span>
            <div className={css.grow}>
              <strong>{t(v.number === 1 ? 'versions.initial' : 'versions.saved')}</strong>
              <p>{v.text}</p>
              <details className={css.methodSnapshot}>
                <summary>{t('guide.snapshot')} · {t(method.title)} · {t('guide.progress', { done: v.execution.checked.length })}</summary>
                <h3>{t('guide.evidence')}</h3><p>{v.execution.evidence || t('guide.unrecorded')}</p>
                <h3>{t('guide.analysis')}</h3><p>{v.execution.analysis || t('guide.unrecorded')}</p>
              </details>
            </div>
            <Button
              onClick={() => {
                setSelectedVersion(v.number - 1)
                setDialog('compare')
              }}
            >
              {t('versions.compare')}
            </Button>
          </div>
        ))}
        <Button
          onClick={() => {
            openTask(state.task)
          }}
        >
          {t('work.draft')}
        </Button>
      </section>
    </>
  )
}
