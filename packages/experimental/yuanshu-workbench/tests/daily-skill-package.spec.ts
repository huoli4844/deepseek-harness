/** 审阅实际随包技能文件，防止技术契约或后台连接逻辑进入员工技能发布目录。 */
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { field } from '../src/business-forms/model.ts'
import { Context } from '@deepseek-ai/cordis'
import Skills from '@deepseek-ai/dsh-skill'
import { registerWorkReportSkill } from '../src/daily-report-runtime.ts'
import { registerBusinessCreationSkills } from '../src/plugins/yuanshu-equipment-intake/capability-skill.ts'

const packageRoot = resolve(import.meta.dirname, '..')

async function files(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(resolve(directory, entry.name)) : Promise.resolve([resolve(directory, entry.name)])))
  return nested.flat()
}

it('发布目录包含统一工作报告技能，技能仅描述员工业务流程，不带接口和内部工具细节', async () => {
  const root = resolve(packageRoot, 'skills')
  const resources = await files(root)
  const skill = await readFile(resolve(root, 'yuanshu-work-report/SKILL.md'), 'utf8')
  expect(skill).toMatch(/^---\nname: yuanshu-work-report\ndescription: /u)
  const create = await readFile(resolve(root, 'yuanshu-business-record-create/SKILL.md'), 'utf8')
  expect(create).toMatch(/^---\nname: yuanshu-business-record-create\ndescription: /u)
  for (const path of resources) {
    expect(path).toMatch(/\.md$/u)
    if (path.endsWith('/AGENTS.md')) continue
    const content = await readFile(path, 'utf8')
    const technical = /https?:\/\/|\/api\/|work_evidence_|work_records_|completed_work|session_id|tsk_daily_|Bearer\s|fetch\(|curl\s/u
    expect(content, path).not.toMatch(technical)
    expect(content, path).not.toContain('business_find_create_target')
  }
  const manifest: unknown = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
  expect(field(manifest, 'files')).toContain('skills')
})

it('宿主发现独立的能力查询技能，并与新增技能共用只读查询入口', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(Skills)
    const owner = ctx.plugin({ inject: ['skills'], apply(scope: Context) {
      registerBusinessCreationSkills(scope, {
        create: resolve(packageRoot, 'skills/yuanshu-business-record-create/SKILL.md'),
        capabilities: resolve(packageRoot, 'skills/yuanshu-business-capabilities/SKILL.md'),
      })
    } })
    await owner.await()
    const name = 'yuanshu-business-capabilities'
    expect((await ctx.skills.list()).map(item => item.name)).toContain(name)
    const loaded = await ctx.skills.get(name)
    expect(loaded?.content).toContain('business_find_create_target')
    expect(loaded?.content).toContain('能力查询只报告结果')
    expect((await ctx.skills.get('yuanshu-business-record-create'))?.content).toContain('business_find_create_target')
    await owner.dispose()
    expect(await ctx.skills.get(name)).toBeUndefined()
  } finally { await ctx.fiber.dispose() }
})

it('实际技能注册表能发现与加载随包业务技能，插件卸载后不再提供', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(Skills)
    const owner = ctx.plugin({ inject: ['skills'], apply(scope: Context) {
      registerWorkReportSkill(scope, resolve(packageRoot, 'skills/yuanshu-work-report/SKILL.md'))
    },
    })
    await owner.await()
    expect((await ctx.skills.list()).map(item => item.name)).toContain('yuanshu-work-report')
    const loaded = await ctx.skills.get('yuanshu-work-report')
    expect(loaded?.content).toContain('由本人在复核表单中保存、确认提交或取消')
    expect(loaded?.content).toContain('新建前先查询今天的日报或本自然周的周报')
    expect(loaded?.content).toContain('已保存草稿，尚未提交')
    expect((await ctx.skills.list()).map(item => item.name)).not.toContain('weekly-report')
    const packaged = await readFile(resolve(packageRoot, 'skills/yuanshu-work-report/SKILL.md'), 'utf8')
    expect(packaged).not.toContain('work_records_')
    await owner.dispose()
    expect((await ctx.skills.list()).map(item => item.name)).not.toContain('yuanshu-work-report')
  } finally { await ctx.fiber.dispose() }
})
