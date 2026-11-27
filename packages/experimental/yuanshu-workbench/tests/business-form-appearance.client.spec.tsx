// @vitest-environment jsdom
/** 验证业务弹窗挂载到页面根节点后仍能跟随工作台外观，不访问后台。 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { WorkbenchAppearanceContext } from '../src/client/app/workbench-appearance.ts'
import appearance from '../src/client/app/workbench-appearance.module.css'
import { BusinessFormModal } from '../src/client/shared/BusinessFormModal.tsx'

afterEach(cleanup)

it('弹窗主题与字号切换时，已输入的内容仍保留', () => {
  function form(classes: string) {
    return <WorkbenchAppearanceContext.Provider value={classes}>
      <BusinessFormModal open title="复核" closeLabel="关闭" onClose={() => {}}>
        <input aria-label="内容" defaultValue="已填内容" />
      </BusinessFormModal>
    </WorkbenchAppearanceContext.Provider>
  }

  const { container, rerender } = render(form(`${appearance.theme} ${appearance.light} ${appearance.small}`))
  const dialog = screen.getByRole('dialog')
  expect(container.contains(dialog)).toBe(false)
  expect(dialog.classList.contains(appearance.light ?? '')).toBe(true)
  expect(dialog.classList.contains(appearance.small ?? '')).toBe(true)

  rerender(form(`${appearance.theme} ${appearance.large}`))
  expect(screen.getByRole('dialog')).toBe(dialog)
  expect(dialog.classList.contains(appearance.light ?? '')).toBe(false)
  expect(dialog.classList.contains(appearance.large ?? '')).toBe(true)
  expect(screen.getByRole('textbox', { name: '内容' })).toHaveProperty('value', '已填内容')
})
