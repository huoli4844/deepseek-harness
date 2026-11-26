/** 资料库弹窗编排：新建、重命名、移动/复制与删除确认。 */
import type { DoclibT } from '../model.ts'
import { ConfirmDialog } from './ConfirmDialog.tsx'
import { PromptDialog } from './PromptDialog.tsx'

/** 当前打开的弹窗。 */
export type DoclibDialog =
  | { readonly kind: 'newFolder' }
  | { readonly kind: 'rename'; readonly name: string; readonly relative: string }
  | { readonly kind: 'move' | 'copy'; readonly items: readonly string[] }
  | { readonly kind: 'deleteLocal'; readonly items: readonly string[]; readonly hasDirectory: boolean }
  | { readonly kind: 'deleteRemote'; readonly ids: readonly string[]; readonly names: readonly string[] }

/**
 * 弹窗宿主：把对话状态映射到具体弹窗，业务动作由回调注入。
 * @param props - 弹窗状态与动作回调。
 */
export function DoclibDialogs(props: {
  readonly dialog: DoclibDialog
  readonly t: DoclibT
  readonly onClose: () => void
  readonly onNewFolder: (name: string) => Promise<boolean>
  readonly onRename: (source: string, name: string) => Promise<boolean>
  readonly onMove: (items: readonly string[], target: string) => Promise<boolean>
  readonly onCopy: (items: readonly string[], target: string) => Promise<boolean>
  readonly onDeleteLocal: (items: readonly string[]) => Promise<boolean>
  readonly onDeleteRemote: (ids: readonly string[]) => Promise<boolean>
}) {
  const { dialog, t, onClose } = props
  switch (dialog.kind) {
    case 'newFolder':
      return <PromptDialog title={t('doclib.files.newFolder')} label={t('doclib.files.nameLabel')}
        initial="" confirmLabel={t('doclib.files.create')} t={t}
        onConfirm={props.onNewFolder} onClose={onClose} />
    case 'rename':
      return <PromptDialog title={t('doclib.files.renameTitle')} label={t('doclib.files.nameLabel')}
        initial={dialog.name} confirmLabel={t('doclib.files.confirm')} t={t}
        onConfirm={name => props.onRename(dialog.relative, name)} onClose={onClose} />
    case 'move':
    case 'copy':
      return <PromptDialog title={t(dialog.kind === 'move' ? 'doclib.files.moveTitle' : 'doclib.files.copyTitle')}
        label={t('doclib.files.targetLabel')} initial="" hint={t('doclib.files.moveHint')}
        confirmLabel={t('doclib.files.confirm')} allowPath t={t}
        onConfirm={target => dialog.kind === 'move'
          ? props.onMove(dialog.items, target)
          : props.onCopy(dialog.items, target)}
        onClose={onClose} />
    case 'deleteLocal':
      return <ConfirmDialog title={t('doclib.files.confirmDeleteTitle')}
        message={t('doclib.files.confirmDeleteBody', { count: dialog.items.length })}
        {...(dialog.hasDirectory ? { detail: t('doclib.files.confirmDeleteFolder') } : {})}
        confirmLabel={t('doclib.files.confirmDelete')} t={t}
        onConfirm={() => props.onDeleteLocal(dialog.items)} onClose={onClose} />
    case 'deleteRemote': {
      const names = dialog.names.join('、')
      return <ConfirmDialog title={t('doclib.files.confirmDeleteTitle')}
        message={t('doclib.files.confirmDeleteBody', { count: dialog.ids.length })}
        {...(names === '' ? {} : { detail: names })}
        confirmLabel={t('doclib.files.confirmDelete')} t={t}
        onConfirm={() => props.onDeleteRemote(dialog.ids)} onClose={onClose} />
    }
  }
}
