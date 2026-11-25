// @vitest-environment jsdom
/** 验证设备台账查询、排序、新建、编辑与删除的接口协作。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EquipmentLedgerScreen } from '../src/client/modules/business-modules/EquipmentLedgerScreen.tsx'
import { nextEquipmentSort } from '../src/client/modules/business-modules/equipment-viewmodel.ts'
import { zh } from '../src/client/core/locales/locales.ts'

const t = (key: keyof typeof zh, values?: Readonly<Record<string, unknown>>) => Object.entries(values ?? {}).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
  zh[key],
)

const equipment = {
  id: 7, code: 'EQ-1', name: '数控车床', equipment_type: 'machine', workshop: '一车间', model: 'CX-1',
  manufacturer: '某机床厂', lifecycle_status: 'active', runtime_status: 'running', maint_interval_days: 90,
  category_name: '机加工', subcategory_name: '车床', serial_no: 'SN-1', qr_code: 'QR-1',
  purchase_date: '2025-01-02', arrival_date: '2025-01-05', last_maint_date: '2026-10-01', next_maint_date: '2026-12-30',
  created_at: '2026-11-24T02:00:00Z', updated_at: '2026-11-25T01:00:00Z',
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('切换已排序表头时在升降序之间取反', () => {
  expect(nextEquipmentSort(nextEquipmentSort(undefined, 'name'), 'name')).toEqual({ key: 'name', direction: 'desc' })
})

it('按关键字检索设备、切换排序并翻页', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const paths: URL[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    if (typeof input !== 'string') throw new Error('预期使用同源代理字符串')
    const path = new URL(input, 'https://workbench.test')
    paths.push(path)
    const filtered = path.searchParams.has('keyword')
    return Response.json({ data: { items: [equipment], total: filtered ? 1 : 482, archive_total: 482, page_size: 20 } })
  }))
  render(<EquipmentLedgerScreen t={t} />)

  await screen.findByText('数控车床')
  expect(screen.getByText('在用')).toBeDefined()
  expect(screen.getByText('运行中')).toBeDefined()
  expect(screen.getByText('2026-11-24 10:00:00')).toBeDefined()
  expect(screen.getByText('2026-11-25 09:00:00')).toBeDefined()
  expect(screen.getByText('第 1 页，共 25 页')).toBeDefined()

  const form = within(screen.getByRole('form', { name: '设备筛选' }))
  fireEvent.change(form.getByLabelText('关键字'), { target: { value: ' EQ-1 ' } })
  fireEvent.click(form.getByRole('button', { name: '搜索' }))
  await screen.findByText('第 1 页，共 1 页')
  expect(Object.fromEntries(paths.at(-1)?.searchParams ?? [])).toEqual({ page: '1', page_size: '20', keyword: 'EQ-1' })

  fireEvent.click(screen.getByRole('button', { name: '设备名称' }))
  await waitFor(() => { expect(paths.at(-1)?.searchParams.get('sort_direction')).toBe('asc') })
  expect(paths.at(-1)?.searchParams.get('sort_by')).toBe('name')
  fireEvent.click(screen.getByRole('button', { name: '设备名称' }))
  await waitFor(() => { expect(paths.at(-1)?.searchParams.get('sort_direction')).toBe('desc') })
})

it('新建设备后按固定操作列编辑并确认软删除', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const requests: { readonly path: string; readonly method: string; readonly body?: string }[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('预期使用同源代理字符串')
    const { pathname, search } = new URL(input, 'https://workbench.test')
    const method = init?.method ?? 'GET'
    requests.push({ path: `${pathname}${search}`, method, ...(typeof init?.body === 'string' ? { body: init.body } : {}) })
    if (method !== 'GET') return Response.json({ data: { id: 7 } })
    return Response.json({ data: { items: [equipment], total: 1, archive_total: 1, page_size: 20 } })
  }))
  render(<EquipmentLedgerScreen t={t} />)
  await screen.findByText('数控车床')

  fireEvent.click(screen.getByRole('button', { name: '新建设备' }))
  const create = within(screen.getByRole('dialog', { name: '新建设备' }))
  fireEvent.change(create.getByLabelText('设备编码'), { target: { value: ' EQ-9 ' } })
  fireEvent.change(create.getByLabelText('设备名称'), { target: { value: '立式加工中心' } })
  fireEvent.click(create.getByRole('button', { name: '保存' }))
  await screen.findByText('设备档案已创建')
  const post = requests.find(request => request.method === 'POST')
  expect(post?.path).toBe('/yuanshu-workbench/equipments')
  expect(JSON.parse(post?.body ?? '{}')).toEqual({
    code: 'EQ-9', name: '立式加工中心', equipment_type: '', workshop: '', model: null, manufacturer: '',
    purchase_date: null, arrival_date: null, lifecycle_status: 'active', runtime_status: 'idle',
    maint_interval_days: 0, serial_no: '', qr_code: '', category_code: '', category_name: '',
    subcategory_code: '', subcategory_name: '', remark: '',
  })

  fireEvent.click(screen.getByRole('button', { name: '编辑设备' }))
  const edit = within(screen.getByRole('dialog', { name: '编辑设备' }))
  fireEvent.change(edit.getByLabelText('设备名称'), { target: { value: '数控车床-改' } })
  fireEvent.click(edit.getByRole('button', { name: '保存' }))
  await screen.findByText('设备修改已保存')
  const put = requests.find(request => request.method === 'PUT')
  expect(put?.path).toBe('/yuanshu-workbench/equipments/7')
  expect(JSON.parse(put?.body ?? '{}')).toMatchObject({ code: 'EQ-1', name: '数控车床-改', maint_interval_days: 90 })

  fireEvent.click(screen.getByRole('button', { name: '删除设备' }))
  const remove = within(screen.getByRole('dialog', { name: '删除设备' }))
  fireEvent.click(remove.getByRole('button', { name: '删除设备' }))
  await screen.findByText('设备档案已删除')
  expect(requests.some(request => request.path === '/yuanshu-workbench/equipments/7' && request.method === 'DELETE')).toBe(true)
})
