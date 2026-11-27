/** 用可更新的模拟云端目录验证新资源登记和人工保存，不写线上数据。 */
import { afterEach, expect, it, vi } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { checkActionAccess } from '../src/plugins/yuanshu-equipment-intake/action-access.ts'
import { createDynamicRegistry } from '../src/plugins/yuanshu-equipment-intake/dynamic-registry.ts'
import { parseDynamicCreates } from '../src/plugins/yuanshu-equipment-intake/dynamic-catalog.ts'
import { createSwaggerLookup } from '../src/plugins/yuanshu-equipment-intake/swagger-create-catalog.ts'
import { BusinessForms } from '../src/plugins/yuanshu-business-forms/index.ts'
import { WorkRecords } from '../src/plugins/yuanshu-work-records/index.ts'

const api = 'https://cloud.test'
const path = '/api/v1/apps/shaoshi/inspection-entries'
const permission = 'inspection.entries.create'
const signal = new AbortController().signal
const credential = { authorization: 'Bearer test-only', tenant: '7' }
const action = { version: 1, title: '检验记录', aliases: ['检验单', 'public.qa_inspections'], permission, receipt_field: 'id' }
const schema = { type: 'object', required: ['name', 'status'], properties: {
  name: { type: 'string', title: '检验名称', maxLength: 40 },
  status: { type: 'integer', title: '检验状态', enum: [0, 1], 'x-enum-labels': { 0: '待检验', 1: '已检验' } },
} }
function catalog(extension?: object, route = path) {
  return { paths: { [route]: { post: { summary: '新增检验记录', operationId: 'createInspection',
    'x-yuanshu-workbench-create': extension,
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Inspection' } } } },
  } } }, components: { schemas: { Inspection: schema } } }
}

function fixture(previewEnabled = false) {
  let published: object = catalog()
  const responses = [Response.json({ code: 0, data: { id: 910 } })]
  const request = vi.fn<typeof fetch>(async (url, init) => {
    const href = url instanceof URL ? url.href : typeof url === 'string' ? url : url.url
    if (href === api + '/swagger/doc.json') return Response.json(published)
    if (href !== api + path || init?.method !== 'POST') throw new Error('请求地址异常')
    return responses.shift() ?? new Response(null, { status: 500 })
  })
  vi.stubGlobal('fetch', request)
  const lookup = createSwaggerLookup(api, signal, previewEnabled)
  const forms = new BusinessForms(new WorkRecords(api))
  const session = Session.create(SessionId('dynamic-review'))
  forms.bind({ session, identity: { user: 8, tenant: 7, canWrite: true }, credential, verifiedAt: Date.now() })
  const read = vi.fn(async () => ({ userId: 8, tenantId: '7', roles: [], permissions: [permission] }))
  const registry = createDynamicRegistry(forms, lookup, api, signal, { read }, previewEnabled)
  return { id: session.id, forms, registry, lookup, read, request, responses,
    publish(document: object = catalog(action)) { published = document },
    writes: () => request.mock.calls.filter(call => call[1]?.method === 'POST') }
}

it('仅联调模式可预览未声明权限的接口，模拟提交不发出业务写请求', async () => {
  const f = fixture(true)
  await expect(f.lookup.dynamicTargets('检验记录')).resolves.toEqual([])
  const [preview] = await f.lookup.previewTargets('检验记录') ?? []
  if (!preview) throw new Error('未发现联调表单')
  expect(preview).not.toHaveProperty('path')
  expect(preview).not.toHaveProperty('permission')
  f.registry.openPreview(f.id, preview, { name: '测试' })
  const draft = f.registry.pending(f.id)
  expect(draft?.preview).toBe(true)
  await expect(f.registry.submit(f.id, credential, { id: draft?.id, content: { name: '测试' } }, signal)).rejects.toMatchObject({ status: 422 })
  await expect(f.registry.submit(f.id, credential, { id: draft?.id, content: { name: '修改后', status: '1' } }, signal))
    .resolves.toEqual({ simulated: true })
  expect(f.registry.pending(f.id)).toMatchObject({ simulated: true, content: { name: '修改后' } })
  expect(f.read).not.toHaveBeenCalled()
  expect(f.writes()).toHaveLength(0)

  const normal = fixture()
  await expect(normal.lookup.previewTargets('检验记录')).resolves.toEqual([])
  expect(() => { normal.registry.openPreview(normal.id, preview, {}) }).toThrow()
})

async function open(f: ReturnType<typeof fixture>) {
  f.publish()
  await f.lookup.refresh()
  const [operation] = (await f.lookup.dynamicTargets('public.qa_inspections')) ?? []
  if (!operation) throw new Error('动态动作未发现')
  expect(await checkActionAccess(f.forms, f.forms.require(f.id), { read: f.read }, operation.permission)).toBe('permission_granted')
  f.registry.open(f.id, operation, { name: '初稿', status: '已检验', extraneous: '忽略' })
  const draft = f.registry.pending(f.id)
  if (!draft) throw new Error('未打开复核表单')
  return draft
}

afterEach(() => { vi.unstubAllGlobals() })

it('刷新后发现从未登记的业务，人工编辑后才向正式地址提交原类型枚举并取得回执', async () => {
  const f = fixture()
  await expect(f.lookup.dynamicTargets('检验单')).resolves.toEqual([])
  const draft = await open(f)
  expect(draft).toMatchObject({ title: '检验记录', content: { name: '初稿', status: '1' } })
  expect(draft.content).not.toHaveProperty('extraneous')
  expect(draft).not.toHaveProperty('path')
  expect(f.writes()).toHaveLength(0)
  const input = { id: draft.id, content: { name: '人工改名', status: '0', extra: '忽略' } }
  const first = f.registry.submit(f.id, credential, input, signal)
  await expect(f.registry.submit(f.id, credential, input, signal)).rejects.toMatchObject({ status: 409 })
  await expect(first).resolves.toEqual({ receipt: '910' })
  await expect(f.registry.submit(f.id, credential, input, signal)).resolves.toEqual({ receipt: '910' })
  const [[url, options] = []] = f.writes()
  expect(url).toEqual(new URL(api + path))
  expect(options?.body).toBe(JSON.stringify({ name: '人工改名', status: 0 }))
  expect(f.writes()).toHaveLength(1)
})

it('字段不合规、权限撤回或发布的契约改变时不发出写请求', async () => {
  const f = fixture()
  const draft = await open(f)
  const input = { id: draft.id, content: { name: '最终内容', status: '0' } }
  await expect(f.registry.submit(f.id, credential, { ...input, content: { status: '0' } }, signal)).rejects.toMatchObject({ status: 422 })
  f.read.mockResolvedValueOnce({ userId: 8, tenantId: '7', roles: [], permissions: [] })
  await expect(f.registry.submit(f.id, credential, input, signal)).rejects.toMatchObject({ status: 403 })
  f.publish(catalog({ ...action, receipt_field: 'code' }))
  await f.lookup.refresh()
  await expect(f.registry.submit(f.id, credential, input, signal)).rejects.toMatchObject({ status: 412 })
  expect(f.writes()).toHaveLength(0)
})

it('明确拒绝后允许重试，回执缺失则保留最终编辑且禁止重复保存', async () => {
  const f = fixture()
  f.responses.unshift(new Response(null, { status: 422 }), Response.json({ code: 0, data: {} }))
  const draft = await open(f)
  const input = { id: draft.id, content: { name: '最终内容', status: '0' } }
  await expect(f.registry.submit(f.id, credential, input, signal)).rejects.toMatchObject({ status: 422 })
  await expect(f.registry.submit(f.id, credential, input, signal)).rejects.toMatchObject({ status: 502 })
  expect(f.registry.pending(f.id)).toMatchObject({ uncertain: true, content: input.content })
  await expect(f.registry.submit(f.id, credential, input, signal)).rejects.toMatchObject({ status: 409 })
  expect(f.writes()).toHaveLength(2)
})

it('拒绝任意地址、缺权限声明和不完整的枚举定义', () => {
  expect(parseDynamicCreates(catalog(action, '//example.test/api/v1/apps/shaoshi/inspection-entries'))).toEqual([])
  expect(parseDynamicCreates(catalog({ ...action, permission: undefined }))).toEqual([])
  const missingLabels = structuredClone(catalog(action))
  Reflect.deleteProperty(missingLabels.components.schemas.Inspection.properties.status, 'x-enum-labels')
  expect(parseDynamicCreates(missingLabels)).toEqual([])
})


it('读取和写入各用自己的权限编码，账号或租户不符时不授予权限', async () => {
  const f = fixture()
  const lease = f.forms.require(f.id)
  const readPermission = 'inspection.entries.read'
  f.read.mockResolvedValueOnce({ userId: 8, tenantId: '7', roles: [], permissions: [readPermission] })
  await expect(checkActionAccess(f.forms, lease, { read: f.read }, permission)).resolves.toBe('permission_denied')
  f.read.mockResolvedValueOnce({ userId: 8, tenantId: '7', roles: [], permissions: [readPermission] })
  await expect(checkActionAccess(f.forms, lease, { read: f.read }, readPermission)).resolves.toBe('permission_granted')
  for (const identity of [{ userId: 9, tenantId: '7' }, { userId: 8, tenantId: '9' }]) {
    f.read.mockResolvedValueOnce({ ...identity, roles: [], permissions: [permission] })
    await expect(checkActionAccess(f.forms, lease, { read: f.read }, permission)).resolves.toBe('permission_unverified')
  }
  f.read.mockRejectedValueOnce(new Error('权限服务不可用'))
  await expect(checkActionAccess(f.forms, lease, { read: f.read }, permission)).resolves.toBe('permission_unverified')
  await expect(checkActionAccess(f.forms, lease, { read: f.read }, undefined)).resolves.toBe('permission_unverified')
})


it('未声明必填项时提交已有字段，后台提示缺项后可以补填重试', async () => {
  const f = fixture()
  const doc = catalog(action)
  const requestSchema = { type: 'object', properties: {
    code: { type: 'string', description: '编码 / code' },
    name: { type: 'string', description: '名称 / name' },
  } }
  f.publish({ ...doc, components: { schemas: { Inspection: requestSchema } } })
  const [operation] = await f.lookup.dynamicTargets('检验单') ?? []
  if (!operation) throw new Error('未匹配表单')
  expect(operation.fields).toMatchObject([{ label: '编码', required: false }, { label: '名称', required: false }])
  f.registry.open(f.id, operation, { code: 'TEST' })
  const draft = f.registry.pending(f.id)
  f.responses.unshift(Response.json({ code: 422, message: '名称不能为空' }))
  await expect(f.registry.submit(f.id, credential, { id: draft?.id, content: { code: 'TEST' } }, signal))
    .rejects.toMatchObject({ status: 422, detail: '名称不能为空' })
  expect(f.writes()[0]?.[1]?.body).toBe(JSON.stringify({ code: 'TEST' }))
  await expect(f.registry.submit(f.id, credential, { id: draft?.id, content: { code: 'TEST', name: '补填名称' } }, signal))
    .resolves.toEqual({ receipt: '910' })
})

it('即使曾有本地兼容映射，云端只发布字段时也不开放供应商新增表单', async () => {
  const f = fixture()
  const path = '/api/v1/apps/shaoshi/suppliers'
  f.publish({ paths: { [path]: { post: {
    operationId: 'postApiV1AppsShaoshiSuppliers', summary: '创建供应商 / Create Supplier',
    requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
      code: { type: 'string' }, name: { type: 'string' },
    } } } } },
  } } } })
  await expect(f.lookup.dynamicTargets('供应商')).resolves.toEqual([])
  await expect(f.lookup.findCreate('供应商')).resolves.toMatchObject({ state: 'documented', fields: ['code', 'name'],
    reason: expect.stringContaining('只说明对话动态表单未就绪') })
  expect(f.writes()).toHaveLength(0)
})

it('没有专用动作标注时使用接口权限和标准回执 schema，缺少任一项仍只发现接口', () => {
  const requestBody = { content: { 'application/json': { schema: { type: 'object', properties: {
    name: { type: 'string', description: '名称 / name' },
  } } } } }
  const responses = { 201: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Reply' } } } } }
  const components = { schemas: {
    Reply: { type: 'object', properties: { data: { $ref: '#/components/schemas/Receipt' } } },
    Receipt: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
  } }
  const post = { summary: '新增检验记录', operationId: 'createInspection', requestBody, responses }
  const doc = (operation: object) => ({ paths: { [path]: { post: operation } }, components })
  expect(parseDynamicCreates(doc(post))).toEqual([])
  expect(parseDynamicCreates(doc({ ...post, responses: {}, 'x-yuanshu-workbench-permission': permission }))).toEqual([])
  expect(parseDynamicCreates(doc({ ...post, 'x-yuanshu-workbench-permission': permission })))
    .toMatchObject([{ path, permission, receiptField: 'id' }])
})
