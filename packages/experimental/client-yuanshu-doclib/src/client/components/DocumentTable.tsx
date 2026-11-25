/** 知识库文档表格纯组件：类型图标、密级徽标、分页与空态、错误态，不请求后台。 */
import type { DoclibDocument, DoclibT } from '../model.ts'
import {
  directoryLabel, doclibPageNumbers, enumLabel, formatTime, mimeKind, parseStatusKey, sensitivityKey,
} from '../viewmodel.ts'
import { FileBadge } from './FileBadge.tsx'
import css from '../doclib.module.css'

/** 单行文档：标题可点开详情，解析失败时附提示徽标。 */
function DocumentRow({ document, t, onOpen }: {
  readonly document: DoclibDocument
  readonly t: DoclibT
  readonly onOpen: (document: DoclibDocument) => void
}) {
  const name = document.title || document.originalName || '—'
  return <tr>
    <td className={css.nameCell}>
      <FileBadge kind={mimeKind(document.mimeType)} />
      <button type="button" className={css.nameButton} title={name} onClick={() => { onOpen(document) }}>{name}</button>
      {document.parseStatus === 'failed' && <span className={css.badgeFailed}>
        {enumLabel(t, document.parseStatus, parseStatusKey)}</span>}
    </td>
    <td className={css.mutedCell} title={document.directoryPath}>
      {directoryLabel(document.directoryPath) || '—'}
    </td>
    <td><span className={css.badge}>{enumLabel(t, document.sensitivity, sensitivityKey)}</span></td>
    <td className={css.mutedCell}>{formatTime(document.updatedAt)}</td>
  </tr>
}

/** 表格状态行：加载中、错误与空数据统一占位。 */
function TableState({ text, retry, t, onRetry }: {
  readonly text: string
  readonly retry: boolean
  readonly t: DoclibT
  readonly onRetry: () => void
}) {
  return <p className={css.tableState} role={retry ? 'alert' : undefined}>
    {text}
    {retry && <button type="button" className={css.linkButton} onClick={onRetry}>{t('doclib.retry')}</button>}
  </p>
}

/**
 * 文档表格：四列（名称/目录/密级/更新时间）+ 底部分页。
 * @param props - 当前页文档、分页信息与回调。
 */
export function DocumentTable(props: {
  readonly documents: readonly DoclibDocument[]
  readonly page: number
  readonly pageCount: number | undefined
  readonly total: number | undefined
  readonly loading: boolean
  readonly error: 'login' | 'failed' | undefined
  readonly t: DoclibT
  readonly onPage: (page: number) => void
  readonly onOpen: (document: DoclibDocument) => void
  readonly onRetry: () => void
}) {
  const { documents, page, pageCount, total, loading, error, t, onPage } = props
  const pages = doclibPageNumbers(page, pageCount)
  return <div className={css.body}>
    <div className={css.tableWrap}>
      {error !== undefined
        ? <TableState text={t(error === 'login' ? 'doclib.loginRequired' : 'doclib.listError')}
          retry t={t} onRetry={props.onRetry} />
        : loading && documents.length === 0
          ? <TableState text={t('doclib.loading')} retry={false} t={t} onRetry={props.onRetry} />
          : documents.length === 0
            ? <TableState text={t('doclib.empty')} retry={false} t={t} onRetry={props.onRetry} />
            : <table className={css.table}>
              <thead>
                <tr>
                  <th scope="col">{t('doclib.column.title')}</th>
                  <th scope="col" className={css.directoryColumn}>{t('doclib.column.directory')}</th>
                  <th scope="col">{t('doclib.column.sensitivity')}</th>
                  <th scope="col">{t('doclib.column.updatedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(document => <DocumentRow key={document.id} document={document}
                  t={t} onOpen={props.onOpen} />)}
              </tbody>
            </table>}
    </div>
    <nav className={css.pagination} aria-label={t('doclib.pagination')}>
      <span className={css.pageTotal}>{t('doclib.total', { total: total ?? 0 })}</span>
      <div className={css.pageControls}>
        <button type="button" className={css.pageButton} disabled={page <= 1}
          onClick={() => { onPage(page - 1) }}>{t('doclib.previousPage')}</button>
        <div className={css.pageNumbers}>
          {pages.map(number => <button key={number} type="button"
            className={page === number ? `${css.pageNumber} ${css.pageNumberActive}` : css.pageNumber}
            aria-current={page === number ? 'page' : undefined}
            onClick={() => { onPage(number) }}>{number}</button>)}
        </div>
        <button type="button" className={css.pageButton}
          disabled={pageCount === undefined || page >= pageCount}
          onClick={() => { onPage(page + 1) }}>{t('doclib.nextPage')}</button>
      </div>
    </nav>
  </div>
}
