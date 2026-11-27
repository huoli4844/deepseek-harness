/** 业务表单共享弹窗。复用平台组件与当前界面外观，不参与数据读写。 */
import { useContext, type ComponentProps } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { WorkbenchAppearanceContext } from '../app/workbench-appearance.ts'
import css from './business-form-modal.module.css'

/** 将当前工作台外观应用到独立挂载的弹窗，原生对话沿用宿主设置。 */
export function BusinessFormModal({
  className, contentClassName, ...props
}: ComponentProps<typeof Modal>) {
  const appearance = useContext(WorkbenchAppearanceContext)
  return <Modal {...props}
    className={[css.modal, appearance && css.workbench, appearance, className].filter(Boolean).join(' ')}
    contentClassName={[css.content, contentClassName].filter(Boolean).join(' ')} />
}
