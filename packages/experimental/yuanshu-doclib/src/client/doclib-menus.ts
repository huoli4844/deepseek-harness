/** 资料库右键菜单构造：按本地条目类型与选择数量给出可用动作，不持有状态。 */
import type { DoclibT } from './model.ts'
import type { ContextMenuItem } from './components/FileContextMenu.tsx'

/** 本地条目可执行动作。 */
export type LocalMenuAction =
  | 'open' | 'openFolder' | 'reveal' | 'attach' | 'download' | 'rename' | 'move' | 'copy' | 'delete'
  | 'properties' | 'copyName' | 'copyPath'
  | 'batchDownload' | 'batchMove' | 'batchCopy' | 'batchDelete'

/** 知识库文档可执行动作。 */
export type RemoteMenuAction =
  | 'attach' | 'download' | 'preview' | 'delete' | 'properties' | 'copyName' | 'copyDirectory'

/** 动作到文案的映射；批量删除需要数量参数，单独处理。 */
const LOCAL_LABELS: Readonly<Record<Exclude<LocalMenuAction, 'batchDelete'>, Parameters<DoclibT>[0]>> = {
  open: 'doclib.menu.open',
  openFolder: 'doclib.files.openFolder',
  reveal: 'doclib.menu.reveal',
  attach: 'doclib.menu.attachToChat',
  download: 'doclib.files.download',
  rename: 'doclib.files.rename',
  move: 'doclib.files.move',
  copy: 'doclib.files.copy',
  delete: 'doclib.files.delete',
  properties: 'doclib.files.properties',
  copyName: 'doclib.menu.copyName',
  copyPath: 'doclib.menu.copyPath',
  batchDownload: 'doclib.files.download',
  batchMove: 'doclib.files.move',
  batchCopy: 'doclib.files.copy',
}

/** 构造菜单项；未提供处理函数的动作自动隐藏。 */
function items(
  order: readonly LocalMenuAction[],
  t: DoclibT,
  handlers: Readonly<Partial<Record<LocalMenuAction, () => void>>>,
  selectionCount: number,
): readonly ContextMenuItem[] {
  const result: ContextMenuItem[] = []
  for (const action of order) {
    const run = handlers[action]
    if (run === undefined) continue
    const label = action === 'batchDelete'
      ? t('doclib.files.deleteSelected', { count: selectionCount })
      : t(LOCAL_LABELS[action])
    result.push({ id: action, label, run })
  }
  return result
}

/**
 * 本地条目右键菜单：单条时给完整文件动作，多选时切换为批量动作。
 * @param options - 是否目录、选择数量与动作处理函数。
 */
export function localMenuItems(options: {
  readonly directory: boolean
  readonly selectionCount: number
  readonly t: DoclibT
  readonly handlers: Readonly<Partial<Record<LocalMenuAction, () => void>>>
}): readonly ContextMenuItem[] {
  const { directory, selectionCount, t, handlers } = options
  if (selectionCount > 1) {
    return items(['batchDownload', 'batchMove', 'batchCopy', 'batchDelete', 'copyPath'], t, handlers, selectionCount)
  }
  return items(directory
    ? ['openFolder', 'rename', 'move', 'copy', 'delete', 'properties', 'copyName', 'copyPath']
    : ['open', 'attach', 'reveal', 'download', 'rename', 'move', 'copy', 'delete', 'properties', 'copyName', 'copyPath'],
  t, handlers, selectionCount)
}

/**
 * 知识库文档右键菜单：保留下载、预览、属性与删除，重命名/移动受后台限制不提供。
 * @param t - 文案函数。
 * @param handlers - 动作处理函数。
 */
export function remoteMenuItems(
  t: DoclibT,
  handlers: Readonly<Partial<Record<RemoteMenuAction, () => void>>>,
): readonly ContextMenuItem[] {
  const labels: Readonly<Record<RemoteMenuAction, Parameters<DoclibT>[0]>> = {
    attach: 'doclib.menu.attachToChat',
    download: 'doclib.files.download',
    preview: 'doclib.menu.preview',
    delete: 'doclib.files.delete',
    properties: 'doclib.files.properties',
    copyName: 'doclib.menu.copyName',
    copyDirectory: 'doclib.menu.copyDirectory',
  }
  const order: readonly RemoteMenuAction[] = [
    'attach', 'download', 'preview', 'properties', 'delete', 'copyName', 'copyDirectory',
  ]
  const result: ContextMenuItem[] = []
  for (const action of order) {
    const run = handlers[action]
    if (run !== undefined) result.push({ id: action, label: t(labels[action]), run })
  }
  return result
}
