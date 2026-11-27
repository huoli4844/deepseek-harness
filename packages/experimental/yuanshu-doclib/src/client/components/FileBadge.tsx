/** 文件类型标识：文档图标与文件夹图标共用，颜色由 data-kind 决定。 */
import { mimeBadge, type DoclibMimeKind } from '../viewmodel.ts'
import css from '../doclib.module.css'

/** 文档类型图标：短标识 + 分类着色。 */
export function FileBadge({ kind }: { readonly kind: DoclibMimeKind }) {
  return <span className={css.fileBadge} data-kind={kind} aria-hidden="true">{mimeBadge(kind)}</span>
}

/** 文件夹图标。 */
export function FolderBadge() {
  return <span className={css.fileBadge} data-kind="folder" aria-hidden="true">
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M1.8 4.2a1 1 0 0 1 1-1h3l1.2 1.4h5.2a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z" />
    </svg>
  </span>
}
