/** 技能包链路：清单规整、导出兼容、解压安装校验与路由转发。 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, expect, it, vi } from 'vitest'
import { normalizeSkillList, fetchSkillArchive, uploadSkillPackage, SkillStoreError } from '../src/skill-store/source.ts'
import { installSkillArchive, SkillInstallError } from '../src/skill-store/install.ts'
import { registerSkillStoreRoutes } from '../src/skill-store/routes.ts'

afterEach(() => { vi.unstubAllGlobals() })

/** 生成只含 SKILL.md 的最小技能包。 */
function skillZip(name: string, markdown: string, root = name): Uint8Array {
  return zipSync({ [`${root}/SKILL.md`]: strToU8(markdown) })
}

/**
 * 捕获技能包路由并模拟请求/响应。
 * @param skillsRoot - 安装目标目录。
 * @returns 触发请求的函数。
 */
function setupRoutes(skillsRoot: string, bundledSkillsRoot?: string) {
  const routes: { handler: (req: unknown, res: unknown) => Promise<void> }[] = []
  const scope = {
    effect: (build: () => unknown) => { void build() },
    logger: { warn: () => { }, info: () => { } },
    webServer: { register: (route: { handler: (req: unknown, res: unknown) => Promise<void> }) => { routes.push(route) } },
  }
  registerSkillStoreRoutes(scope as never, { api: 'https://backend.test', skillsRoot, bundledSkillsRoot })
  const route = routes[0]!
  return async (method: string, url: string, options: {
    headers?: Record<string, string>
    body?: Uint8Array
  } = {}) => {
    let status = 0
    let text: string | undefined
    let binary: Buffer | undefined
    const headers = options.headers ?? {
      authorization: 'Bearer t', 'sec-fetch-site': 'same-origin', 'x-active-tenant': 'shaoshi',
    }
    await route.handler(
      { method, url, headers, async *[Symbol.asyncIterator]() { if (options.body !== undefined) yield Buffer.from(options.body) } },
      {
        writeHead: (code: number) => { status = code },
        end: (value: string | Buffer | undefined) => {
          if (typeof value === 'string') text = value
          else if (value !== undefined) binary = Buffer.from(value)
        },
      },
    )
    return {
      status,
      body: text === undefined || text === '' ? undefined : JSON.parse(text) as unknown,
      binary,
    }
  }
}

it('技能清单兼容 data.items 与裸数组，并补全名称与版本', () => {
  const nested = normalizeSkillList({ success: true, data: { items: [
    { id: 7, display_name: '周报助手', latest_version: '1.2.0', governance_state: 'published', summary: '写周报' },
    { skill_id: 'skill-9', title: '质量巡检' },
  ] } })
  expect(nested).toEqual([
    { id: '7', name: '周报助手', description: '写周报', version: '1.2.0', status: 'published' },
    { id: 'skill-9', name: '质量巡检', description: '' },
  ])
  expect(normalizeSkillList([{ id: 1, name: 'A' }])).toEqual([{ id: '1', name: 'A', description: '' }])
  expect(normalizeSkillList({ data: null })).toEqual([])
})

it('导出接口返回 base64 时解码出 zip，客户端接口失败后回退到管理端导出', async () => {
  const archive = skillZip('yuanshu-demo', '---\nname: yuanshu-demo\n---\nbody')
  const base64 = Buffer.from(archive).toString('base64')
  const fetchMock = vi.fn(async (input: URL) => {
    if (String(input).includes('/api/v1/client/skills/1/package')) return new Response('{}', { status: 403 })
    return Response.json({ success: true, data: { content_base64: base64 } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const bytes = await fetchSkillArchive({ api: 'https://backend.test', authorization: 'Bearer t' }, '1')
  expect(Buffer.from(bytes).equals(Buffer.from(archive))).toBe(true)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('下载全部候选接口都失败时抛出可展示错误', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  await expect(fetchSkillArchive({ api: 'https://backend.test', authorization: 'Bearer t' }, '2'))
    .rejects.toMatchObject({ status: 404, message: '该技能没有可下载的已发布包' })
})

it('上传时以 multipart 转发文件并携带令牌与租户', async () => {
  const archive = skillZip('yuanshu-demo', '---\nname: yuanshu-demo\n---\nbody')
  const fetchMock = vi.fn(async (_input: URL, init: RequestInit) => {
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer t')
    expect(headers['X-Active-Tenant']).toBe('shaoshi')
    expect(headers['content-type']).toContain('multipart/form-data; boundary=')
    expect(Buffer.from(init.body as Buffer).includes(Buffer.from('filename="yuanshu-demo.zip"'))).toBe(true)
    return Response.json({ success: true, data: { id: 3, name: 'yuanshu-demo' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const data = await uploadSkillPackage(
    { api: 'https://backend.test', authorization: 'Bearer t', tenant: 'shaoshi' },
    'yuanshu-demo.zip',
    archive,
  )
  expect(data).toEqual({ id: 3, name: 'yuanshu-demo' })
})

it('安装技能包时按 SKILL.md 声明的名称落盘', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-'))
  try {
    const archive = zipSync({
      'package/SKILL.md': strToU8('---\nname: yuanshu-demo\n---\n# demo'),
      'package/references/guide.md': strToU8('guide'),
    })
    const installed = await installSkillArchive(archive, root)
    expect(installed.name).toBe('yuanshu-demo')
    expect(await readFile(join(root, 'yuanshu-demo', 'SKILL.md'), 'utf8')).toContain('# demo')
    expect(await readFile(join(root, 'yuanshu-demo', 'references', 'guide.md'), 'utf8')).toBe('guide')
    await expect(installSkillArchive(archive, root)).rejects.toMatchObject({ status: 409 })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('拒绝路径穿越、缺 SKILL.md 与解压后过大的技能包', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-'))
  try {
    const traversal = zipSync({ '../escape.txt': strToU8('x'), 'SKILL.md': strToU8('---\nname: ok\n---') })
    await expect(installSkillArchive(traversal, root)).rejects.toBeInstanceOf(SkillInstallError)
    const empty = zipSync({ 'readme.md': strToU8('x') })
    await expect(installSkillArchive(empty, root)).rejects.toMatchObject({ status: 400 })
    const big = zipSync({ 'SKILL.md': strToU8('---\nname: ok\n---'), 'big.bin': new Uint8Array(5 * 1024 * 1024 + 1) })
    await expect(installSkillArchive(big, root)).rejects.toMatchObject({ status: 413 })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('路由返回清单、拒绝非法标识，并支持上传与安装', async () => {
  const skillsRoot = await mkdtemp(join(tmpdir(), 'dsh-skill-'))
  try {
    const archive = skillZip('yuanshu-demo', '---\nname: yuanshu-demo\n---\nbody')
    const fetchMock = vi.fn(async (input: URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/skills')) {
        return Response.json({ data: { items: [{ id: 1, name: 'yuanshu-demo', version: '1.0.0' }] } })
      }
      if (url.includes('/package')) {
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) { controller.enqueue(archive); controller.close() },
        }), { headers: { 'content-type': 'application/zip' } })
      }
      return Response.json({ success: true, data: { id: 1, name: 'yuanshu-demo' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const ask = setupRoutes(skillsRoot)

    const list = await ask('GET', '/yuanshu-workbench/skill-store')
    expect(list.body).toEqual({ data: [{ id: '1', name: 'yuanshu-demo', description: '', version: '1.0.0' }] })

    expect((await ask('GET', '/yuanshu-workbench/skill-store/abc/download')).status).toBe(400)

    const download = await ask('GET', '/yuanshu-workbench/skill-store/1/download?name=yuanshu-demo')
    expect(download.status).toBe(200)
    expect(download.binary?.subarray(0, 2).toString()).toBe('PK')

    const install = await ask('POST', '/yuanshu-workbench/skill-store/1/install')
    expect(install.body).toEqual({ data: { name: 'yuanshu-demo' } })

    const removed = await ask('DELETE', '/yuanshu-workbench/skill-store/1')
    expect(removed.body).toEqual({ data: { id: '1' } })

    const upload = await ask('POST', '/yuanshu-workbench/skill-store/upload', {
      headers: {
        authorization: 'Bearer t', 'sec-fetch-site': 'same-origin',
        'x-skill-file-name': encodeURIComponent('yuanshu-demo.zip'),
      },
      body: archive,
    })
    expect(upload.body).toEqual({ data: { id: 1, name: 'yuanshu-demo' } })

    expect((await ask('GET', '/yuanshu-workbench/skill-store', { headers: {} })).status).toBe(401)
    expect((await ask('POST', '/yuanshu-workbench/skill-store/upload', {
      headers: { authorization: 'Bearer t', 'sec-fetch-site': 'cross-site' }, body: archive,
    })).status).toBe(403)
  } finally {
    await rm(skillsRoot, { recursive: true, force: true })
  }
})

it('本机技能目录一键打包上传，非法名称与本机缺失分别拒绝', async () => {
  const skillsRoot = await mkdtemp(join(tmpdir(), 'dsh-skill-'))
  try {
    await mkdir(join(skillsRoot, 'yuanshu-demo'), { recursive: true })
    await writeFile(join(skillsRoot, 'yuanshu-demo', 'SKILL.md'), '---\nname: yuanshu-demo\n---')
    const fetchMock = vi.fn(async (input: URL, init: RequestInit) => {
      expect(String(input)).toContain('/api/v1/skills/import-package')
      expect(Buffer.from(init.body as Buffer).includes(Buffer.from('filename="yuanshu-demo.zip"'))).toBe(true)
      return Response.json({ success: true, data: { name: 'yuanshu-demo' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const ask = setupRoutes(skillsRoot)
    const uploaded = await ask('POST', '/yuanshu-workbench/skill-store/local/upload', {
      body: Buffer.from(JSON.stringify({ name: 'yuanshu-demo' })),
    })
    expect(uploaded.body).toEqual({ data: { name: 'yuanshu-demo' } })

    const invalid = await ask('POST', '/yuanshu-workbench/skill-store/local/upload', {
      body: Buffer.from(JSON.stringify({ name: '../x' })),
    })
    expect(invalid.status).toBe(400)

    // 通用技能不参与上传。
    await mkdir(join(skillsRoot, 'general-demo'), { recursive: true })
    await writeFile(join(skillsRoot, 'general-demo', 'SKILL.md'), '# general')
    const general = await ask('POST', '/yuanshu-workbench/skill-store/local/upload', {
      body: Buffer.from(JSON.stringify({ name: 'general-demo' })),
    })
    expect(general.status).toBe(400)

    const missing = await ask('POST', '/yuanshu-workbench/skill-store/local/upload', {
      body: Buffer.from(JSON.stringify({ name: 'yuanshu-missing' })),
    })
    expect(missing.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  } finally {
    await rm(skillsRoot, { recursive: true, force: true })
  }
})

it('后台失败时把说明转成技能包错误', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: '没有权限' }, { status: 403 })))
  await expect(uploadSkillPackage({ api: 'https://backend.test', authorization: 'Bearer t' }, 'a.zip', skillZip('a', '---\nname: a\n---')))
    .rejects.toBeInstanceOf(SkillStoreError)
})
