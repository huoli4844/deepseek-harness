/** 渲染业务档案分页控件，不请求后台。 */
import { Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, Input, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import css from './business-modules.module.css'
import { recordPageNumbers } from './record-list-viewmodel.ts'

/** 显示分页状态、页码组以及前后翻页和指定页跳转。 */
export function RecordPagination({ page, pageCount, canGoNext, resource, t, onPage }: {
  readonly page: number
  readonly pageCount: number | undefined
  readonly canGoNext: boolean
  readonly resource: 'customer' | 'supplier' | 'material' | 'labor' | 'equipment' | 'contract'
  readonly t: WorkbenchT
  readonly onPage: (page: number) => void
}) {
  const previous = t(`${resource}.previousPage`)
  const next = t(`${resource}.nextPage`)
  return <nav className={css.businessModulePagination} aria-label={t(`${resource}.pagination`)}>
    <span aria-live="polite">{pageCount === undefined
      ? t(`${resource}.pageStatusUnknown`, { page })
      : t(`${resource}.pageStatus`, { page, pages: pageCount })}</span>
    <div className={css.businessModulePageNumbers}>
      <Tooltip label={previous} side="top" portal>
        <Button size="sm" variant="toolbar" icon={<IconChevronLeftOutlineRegular size={16} />} aria-label={previous}
          disabled={page <= 1} onClick={() => { onPage(page - 1) }} />
      </Tooltip>
      {recordPageNumbers(page, pageCount).map(number => <Button key={number} size="sm"
        variant={page === number ? 'outline' : 'toolbar'} aria-current={page === number ? 'page' : undefined}
        aria-label={t('record.pageNumber', { page: number })} onClick={() => { onPage(number) }}>{number}</Button>)}
      <Tooltip label={next} side="top" portal>
        <Button size="sm" variant="toolbar" icon={<IconChevronRightOutlineRegular size={16} />} aria-label={next}
          disabled={!canGoNext} onClick={() => { onPage(page + 1) }} />
      </Tooltip>
    </div>
    <form className={css.businessModuleJump} onSubmit={(event) => {
      event.preventDefault()
      onPage(Number(new FormData(event.currentTarget).get('page')))
    }}>
      <Input name="page" type="number" min={1} max={pageCount ?? 1_000_000} required
        aria-label={t('record.jumpPage')} placeholder={t('record.jumpPage')} />
      <Button type="submit" size="sm" variant="outline">{t('record.jump')}</Button>
    </form>
  </nav>
}
