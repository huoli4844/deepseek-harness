/** 业务模块占位页统一展示层，复用工作台文案并标明接入状态与数据来源。 */
import { useId } from 'react'
import type { WorkbenchKey } from '../../core/locales/locales.ts'
import type { WorkbenchT } from '../../app/page-api.ts'
import css from './business-modules.module.css'
import workbenchCss from '../../app/Workbench.module.css'

/** 渲染单个尚未接入业务接口的模块页面。 */
export function BusinessModuleScreen({ titleKey, t }: {
  readonly titleKey: WorkbenchKey
  readonly t: WorkbenchT
}) {
  const id = useId()
  return <div className={css.businessModulePage}>
    <section className={`${workbenchCss.card} ${css.businessModuleCard}`} aria-labelledby={`${id}-title`}>
      <div className={workbenchCss.sectionHeading}>
        <h1 id={`${id}-title`}>{t(titleKey)}</h1>
      </div>
      <p>{t('position.module.pending')}</p>
      <dl className={css.businessModuleMeta}>
        <dt>{t('position.module.status')}</dt>
        <dd>{t('position.module.notConnected')}</dd>
        <dt>{t('position.module.source')}</dt>
        <dd>{t('position.module.sourceNotConnected')}</dd>
      </dl>
    </section>
  </div>
}
