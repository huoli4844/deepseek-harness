/** 验证新增能力自动发现，使用模拟的云端契约，不访问业务数据。 */
import { afterEach, expect, it, vi } from 'vitest'
import { createSwaggerLookup } from '../src/plugins/yuanshu-equipment-intake/swagger-create-catalog.ts'

afterEach(() => { vi.unstubAllGlobals() })

const project = {
  summary: '创建少仕项目 / Create a Shaoshi project',
  requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } },
}

it('未登记的业务对象按云端文档发现，且不把接口视为已接入的表单', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
    paths: {
      '/api/v1/apps/shaoshi/projects': { post: project },
      '/api/v1/annotations/projects': { post: project },
      '/api/v1/apps/deepseek-harness/assets': { post: { summary: '新增资产档案' } },
    },
    components: { schemas: { Project: { properties: { code: {}, name: {} } } } },
  }))
  vi.stubGlobal('fetch', fetchMock)
  const lookup = createSwaggerLookup('https://workbench.test/', new AbortController().signal)
  const [byName, byTable, count] = await Promise.all([lookup.findCreate('项目'), lookup.findCreate('public.prj_projects'), lookup.refresh()])
  expect(count).toBe(3)
  expect(byName).toMatchObject({ state: 'documented', object: '项目', fields: ['code', 'name'] })
  expect(byTable).toEqual({ state: 'unknown' })
  expect(byName).not.toHaveProperty('open_form')
  await expect(lookup.findCreate('资产档案')).resolves.toMatchObject({ state: 'documented', object: '资产档案' })
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://workbench.test/swagger/doc.json', expect.anything())
})

it('云端目录暂时不可用时保留独立状态，并合并短期重试', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }))
  vi.stubGlobal('fetch', fetchMock)
  const lookup = createSwaggerLookup('https://workbench.test', new AbortController().signal)
  await expect(lookup.refresh()).resolves.toBeUndefined()
  await expect(lookup.findCreate('项目')).resolves.toEqual({ state: 'catalog_unavailable' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('从登录预取的快照按关键词查找其他方法，再次登录刷新接口变更', async () => {
  const initial = { paths: { '/api/v1/apps/shaoshi/projects/{code}': { put: { summary: '更新少仕项目' } } } }
  const updated = { paths: { '/api/v1/apps/shaoshi/projects/{code}': { patch: { summary: '编辑少仕项目' } } } }
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(initial))
    .mockResolvedValueOnce(Response.json(updated))
  vi.stubGlobal('fetch', fetchMock)
  const lookup = createSwaggerLookup('https://workbench.test', new AbortController().signal)
  await lookup.refresh()
  await expect(lookup.search('项目 PUT')).resolves.toMatchObject({ total: 1, operations: [{ method: 'PUT' }] })
  await lookup.refresh()
  await expect(lookup.search('项目 PUT')).resolves.toMatchObject({ total: 0 })
  await expect(lookup.search('项目 PATCH')).resolves.toMatchObject({ total: 1, operations: [{ method: 'PATCH' }] })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})


it('同一路径的查看和编辑动作使用不同权限声明，缺少声明的动作不推断权限', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ paths: {
    '/api/v1/apps/shaoshi/projects/{code}': {
      get: { summary: '查看项目', 'x-yuanshu-workbench-permission': 'projects:list' },
      patch: { summary: '编辑项目', 'x-yuanshu-workbench-permission': 'projects:update' },
      delete: { summary: '删除项目' },
    },
  } })))
  const lookup = createSwaggerLookup('https://workbench.test', new AbortController().signal)
  await expect(lookup.search('项目')).resolves.toMatchObject({ total: 3, operations: [
    { method: 'GET', permission: 'projects:list' }, { method: 'PATCH', permission: 'projects:update' },
    { method: 'DELETE', permission: undefined },
  ] })
})

it('项目周报按请求体字段生成表单，未声明类型的字段降级保留', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
    paths: {
      '/api/v1/apps/shaoshi/projects/{code}/reports': { post: {
        operationId: 'postApiV1AppsShaoshiProjectsCodeReports',
        parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectReportPayload' } } } },
      } },
    },
    components: { schemas: { ProjectReportPayload: { type: 'object', properties: {
      progress_summary: { type: 'string', description: '本周进展摘要 / Weekly progress summary' },
      need_support: { type: 'string', description: '需要的支持' },
      key_metrics: { description: '关键指标' },
    }, additionalProperties: false } } },
  })))
  const lookup = createSwaggerLookup('https://workbench.test', new AbortController().signal)
  const fields = await lookup.operationFields('postApiV1AppsShaoshiProjectsCodeReports')
  expect(fields).toMatchObject([
    { key: 'progress_summary', label: '本周进展摘要', required: false },
    { key: 'need_support', label: '需要的支持', required: false },
    { key: 'key_metrics', label: '关键指标', type: 'string', unsupported: true },
  ])
  expect(fields?.[0]).not.toHaveProperty('unsupported')
})

it('必填字段无法渲染时不生成提交表单', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
    paths: {
      '/api/v1/apps/shaoshi/projects/{code}/reports': { post: {
        operationId: 'postApiV1AppsShaoshiProjectsCodeReports',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectReportPayload' } } } },
      } },
    },
    components: { schemas: { ProjectReportPayload: {
      type: 'object', properties: { name: { type: 'string' }, metrics: { description: '指标' } }, required: ['metrics'],
    } } },
  })))
  const lookup = createSwaggerLookup('https://workbench.test', new AbortController().signal)
  await expect(lookup.operationFields('postApiV1AppsShaoshiProjectsCodeReports')).resolves.toBeUndefined()
})
