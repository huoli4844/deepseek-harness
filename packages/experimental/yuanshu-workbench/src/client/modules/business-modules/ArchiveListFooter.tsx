/** 将档案总数和分页控件按内容页规则排列，不维护查询状态。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import { RecordPagination } from './RecordPagination.tsx'
import css from './business-modules.module.css'

/** 在分页控件前显示档案总数。 */
export function ArchiveListFooter({ resource, t, archiveTotal, page, pageCount, canGoNext, ready, onPage }: {
  readonly resource: 'customer' | 'supplier' | 'material' | 'labor' | 'equipment' | 'contract'
  readonly t: WorkbenchT
  readonly archiveTotal: number | undefined
  readonly page: number
  readonly pageCount: number | undefined
  readonly canGoNext: boolean
  readonly ready: boolean
  readonly onPage: (page: number) => void
}) {
  return <div className={css.archiveFooter}>
    <div className={css.businessModuleTotal} aria-live="polite">
      <span>{t(`${resource}.total`)}</span><strong>{archiveTotal ?? '—'}</strong>
    </div>
    {ready && <RecordPagination resource={resource} t={t} page={page} pageCount={pageCount}
      canGoNext={canGoNext} onPage={onPage} />}
  </div>
}
