/** 校验个人页配置本机存储：读写回环、损坏容错与账号格式防路径穿越。 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { PersonalPageStore } from '../src/personal-pages/store.ts'

/** 页面定义样例；存储层只关心对象数组，不校验业务字段。 */
const pages = [{ id: 'p1', name: '本周项目工时', widgets: [{ id: 'w1', type: 'labor-month' }] }]

/** 在独立临时目录中构造一个存储实例，避免测试相互污染。 */
function freshStore(): PersonalPageStore {
  process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-personal-pages-'))
  return new PersonalPageStore()
}

it('写入后按账号读回页面定义', async () => {
  const store = freshStore()
  await store.write('shaoshi:12', pages)
  expect(await store.read('shaoshi:12')).toEqual(pages)
})

it('不同账号互相隔离，未写入的账号返回 undefined', async () => {
  const store = freshStore()
  await store.write('shaoshi:12', pages)
  expect(await store.read('shaoshi:13')).toBeUndefined()
  await store.write('shaoshi:13', [])
  expect(await store.read('shaoshi:13')).toEqual([])
})

it('文件损坏或版本不符时返回 undefined，而不是抛错', async () => {
  const store = freshStore()
  await store.write('shaoshi:12', pages)
  const file = store.fileOf('shaoshi:12')
  await (await import('node:fs/promises')).writeFile(file, '{ not json', 'utf8')
  expect(await store.read('shaoshi:12')).toBeUndefined()
  await (await import('node:fs/promises')).writeFile(file, JSON.stringify({ version: 99, pages }), 'utf8')
  expect(await store.read('shaoshi:12')).toBeUndefined()
})

it('账号必须匹配「租户:员工ID」，携带路径片段或目录穿越时拒绝', async () => {
  const store = freshStore()
  await expect(store.write('../evil', pages)).rejects.toThrow('账号格式不正确')
  await expect(store.write('a/b:1', pages)).rejects.toThrow('账号格式不正确')
  await expect(store.read('shaoshi:')).rejects.toThrow('账号格式不正确')
})
