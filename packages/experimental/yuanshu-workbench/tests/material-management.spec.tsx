// @vitest-environment jsdom
/** 验证物料分类与档案查询、排序和新增操作的接口协作。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MaterialManagementScreen } from '../src/client/modules/business-modules/MaterialManagementScreen.tsx'
import { materialCategoryTree, nextMaterialSort } from '../src/client/modules/business-modules/material-viewmodel.ts'
import { zh } from '../src/client/core/locales/locales.ts'

const t = (key: keyof typeof zh, values?: Readonly<Record<string, unknown>>) => Object.entries(values ?? {}).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
  zh[key],
)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('构建搜索返回的祖先路径并切换已排序表头', () => {
  const root = { id: 1, code: 'R', name: '原材料', parentId: undefined }
  const child = { id: 2, code: 'S', name: '钢材', parentId: 1 }
  expect(materialCategoryTree([child, root])).toEqual([
    { category: root, children: [{ category: child, children: [] }] },
  ])
  expect(nextMaterialSort(nextMaterialSort(undefined, 'name'), 'name')).toEqual({ key: 'name', direction: 'desc' })
})

it('选分类、提交字段筛选、排序并从真实匹配数翻页', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const paths: URL[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    if (typeof input !== 'string') throw new Error('预期使用同源代理字符串')
    const path = new URL(input, 'https://workbench.test')
    paths.push(path)
    if (path.pathname.endsWith('/material-categories')) return Response.json({
      data: { items: [{ id: 1, code: 'R', name: '原材料' }, { id: 2, code: 'S', name: '钢材', parent_id: 1 }] },
    })
    const filtersApplied = path.searchParams.has('code')
    return Response.json({ data: {
      items: [{ id: 7, code: 'M-1', name: '钢板', material_type: 'raw', created_at: '2026-11-24T02:00:00Z' }],
      total: filtersApplied ? 22 : 482, archive_total: 482, page_size: 20,
      material_types: ['raw', 'finished'], critical_levels: ['A', 'B'],
    } })
  }))
  render(<MaterialManagementScreen t={t} />)

  await screen.findByText('钢板')
  expect(screen.getByText('2026-11-24 10:00:00')).toBeDefined()
  expect(screen.getByText('第 1 页，共 25 页')).toBeDefined()
  expect(within(screen.getByRole('region', { name: '物料统计' })).getByText('482')).toBeDefined()
  expect(screen.queryByRole('heading', { name: '物料管理' })).toBeNull()
  expect(screen.queryByRole('button', { name: '钢材' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '展开原材料' }))
  fireEvent.click(screen.getByRole('button', { name: '钢材' }))
  await waitFor(() => { expect(paths.at(-1)?.searchParams.get('category_id')).toBe('2') })

  const form = within(screen.getByRole('form', { name: '物料筛选' }))
  fireEvent.change(form.getByLabelText('物料编码'), { target: { value: ' M- ' } })
  fireEvent.change(form.getByLabelText('物料名称'), { target: { value: '钢&板' } })
  fireEvent.change(form.getByLabelText('类型'), { target: { value: 'raw' } })
  fireEvent.change(form.getByLabelText('关键等级'), { target: { value: 'A' } })
  expect(paths.at(-1)?.searchParams.has('code')).toBe(false)
  fireEvent.click(form.getByRole('button', { name: '搜索' }))
  await screen.findByText('第 1 页，共 2 页')
  expect(Object.fromEntries(paths.at(-1)?.searchParams ?? [])).toEqual({
    page: '1', page_size: '20', code: 'M-', name: '钢&板', material_type: 'raw', critical_level: 'A', category_id: '2',
  })
  fireEvent.click(screen.getByRole('button', { name: '物料名称' }))
  await waitFor(() => { expect(paths.at(-1)?.searchParams.get('sort_dir')).toBe('asc') })
  fireEvent.click(screen.getByRole('button', { name: '物料名称' }))
  await waitFor(() => { expect(paths.at(-1)?.searchParams.get('sort_dir')).toBe('desc') })
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  await screen.findByText('第 2 页，共 2 页')
  expect(paths.at(-1)?.searchParams.get('sort_by')).toBe('name')
  expect(within(screen.getByRole('region', { name: '物料统计' })).getByText('482')).toBeDefined()
})

it('从固定操作列编辑物料并确认软删除', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const requests: { readonly path: string; readonly method: string; readonly body?: string }[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('预期使用同源代理字符串')
    const { pathname, search } = new URL(input, 'https://workbench.test')
    const method = init?.method ?? 'GET'
    requests.push({ path: `${pathname}${search}`, method, ...(typeof init?.body === 'string' ? { body: init.body } : {}) })
    if (pathname.endsWith('/material-categories')) return Response.json({ data: { items: [] } })
    if (method === 'PUT' || method === 'DELETE') return Response.json({ data: { id: 7 } })
    return Response.json({ data: {
      items: [{ id: 7, code: 'M-1', name: '钢板', spec: '4mm', material_type: 'raw', category_code: 'R',
        category_code2: 'R-1', unit: 'kg', brand: 'B', model: 'X', drawing_no: null, price_suggested: 1.25,
        safety_stock: 2, lead_time_days: 3, critical_level: 'A', remark: '备注', status: 1,
        created_by: 10, created_at: '2026-11-24T02:00:00Z', updated_at: '2026-11-24T02:00:00Z' }],
      total: 1, archive_total: 1, page_size: 20, material_types: ['raw'], critical_levels: ['A'],
    } })
  }))
  render(<MaterialManagementScreen t={t} />)
  await screen.findByText('钢板')
  expect(screen.getByRole('columnheader', { name: '操作' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '编辑物料' }))
  const edit = within(screen.getByRole('dialog', { name: '编辑物料' }))
  fireEvent.change(edit.getByLabelText('物料名称'), { target: { value: '高强钢板' } })
  fireEvent.click(edit.getByRole('button', { name: '保存' }))
  await screen.findByText('物料修改已保存')
  const put = requests.find(request => request.method === 'PUT')
  expect(put?.path).toBe('/yuanshu-workbench/materials/7')
  expect(JSON.parse(put?.body ?? '{}')).toMatchObject({ code: 'M-1', name: '高强钢板', material_type: 'raw', price_suggested: 1.25 })
  fireEvent.click(screen.getByRole('button', { name: '删除物料' }))
  const remove = within(screen.getByRole('dialog', { name: '删除物料' }))
  fireEvent.click(remove.getByRole('button', { name: '删除物料' }))
  await screen.findByText('物料档案已删除')
  expect(requests.some(request => request.path === '/yuanshu-workbench/materials/7' && request.method === 'DELETE')).toBe(true)
})

it('后端搜索分类并在弹窗中新增当前分类的子分类', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const categories = [{ id: 1, code: 'R', name: '原材料' }, { id: 2, code: 'S', name: '钢材', parent_id: 1 }]
  let allowWrite = false
  const mock = vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('预期使用同源代理字符串')
    const { pathname } = new URL(input, 'https://workbench.test')
    if (pathname.endsWith('/materials')) {
      return Response.json({ data: { items: [], total: 0, archive_total: 40, page_size: 20 } })
    }
    if (init?.method === 'POST') {
      if (!allowWrite) return Response.json({ data: null }, { status: 401 })
      const row = { id: 3, code: 'S-C', name: '冷轧钢', parent_id: 2 }
      categories.push(row)
      return Response.json({ data: row }, { status: 201 })
    }
    return Response.json({ data: { items: categories } })
  })
  vi.stubGlobal('fetch', mock)
  render(<MaterialManagementScreen t={t} />)
  fireEvent.change(screen.getByRole('textbox', { name: '分类编码或名称' }), { target: { value: '钢' } })
  // 分类搜索按钮与物料列表搜索按钮同名，需在分类面板范围内查询。
  fireEvent.click(within(screen.getByRole('region', { name: '物料分类' })).getByRole('button', { name: '搜索' }))
  fireEvent.click(await screen.findByRole('button', { name: '钢材' }))
  expect(mock).toHaveBeenCalledWith('/yuanshu-workbench/material-categories?keyword=%E9%92%A2', expect.anything())
  fireEvent.click(screen.getByRole('button', { name: '新增分类' }))
  const dialog = within(screen.getByRole('dialog', { name: '新增分类' }))
  fireEvent.change(dialog.getByLabelText('分类编码'), { target: { value: ' S-C ' } })
  fireEvent.change(dialog.getByLabelText('分类名称'), { target: { value: '冷轧钢' } })
  fireEvent.click(dialog.getByRole('button', { name: '保存' }))
  expect(await dialog.findByText('请重新登录后重试。若仍失败，请联系管理员检查物料分类写入授权')).toBeDefined()
  allowWrite = true
  fireEvent.click(dialog.getByRole('button', { name: '保存' }))
  await waitFor(() => { expect(screen.queryByRole('dialog', { name: '新增分类' })).toBeNull() })
  expect(mock).toHaveBeenCalledWith('/yuanshu-workbench/material-categories', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ code: 'S-C', name: '冷轧钢', parent_id: 2 }),
  }))
  await waitFor(() => { expect(mock).toHaveBeenCalledWith('/yuanshu-workbench/materials?page=1&page_size=20&category_id=3', expect.anything()) })
  expect((await screen.findByRole('button', { name: '冷轧钢' })).getAttribute('aria-pressed')).toBe('true')
})
