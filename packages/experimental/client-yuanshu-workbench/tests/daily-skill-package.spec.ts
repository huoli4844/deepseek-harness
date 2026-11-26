/** 审阅实际随包技能文件，防止技术契约或后台连接逻辑进入员工技能发布目录。 */
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { field } from '../src/business-forms/model.ts'
import { Context } from '@deepseek-ai/cordis'
import Skills from '@deepseek-ai/dsh-skill'
import { registerDailySkill, registerWeeklySkill } from '../src/daily-report-runtime.ts'

const packageRoot = resolve(import.meta.dirname, '..')

async function files(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(resolve(directory, entry.name)) : Promise.resolve([resolve(directory, entry.name)])))
  return nested.flat()
}

it('发布目录包含独立日报技能，技能仅描述员工业务流程，不带接口和内部工具细节', async () => {
  const root = resolve(packageRoot, 'skills')
  const resources = await files(root)
  const skill = await readFile(resolve(root, 'daily-report/SKILL.md'), 'utf8')
  expect(skill).toMatch(/^---\nname: daily-report\ndescription: /u)
  for (const path of resources) {
    expect(path).toMatch(/\.md$/u)
    if (path.endsWith('/AGENTS.md')) continue
    const content = await readFile(path, 'utf8')
    const technical = /https?:\/\/|\/api\/|work_evidence_|work_records_|completed_work|session_id|tsk_daily_|Bearer\s|fetch\(|curl\s/u
    expect(content, path).not.toMatch(technical)
  }
  const manifest: unknown = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
  expect(field(manifest, 'files')).toContain('skills')
})

it('实际技能注册表能发现与加载随包业务技能，插件卸载后不再提供', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(Skills)
    const owner = ctx.plugin({ inject: ['skills'], apply(scope: Context) {
      registerDailySkill(scope, resolve(packageRoot, 'skills/daily-report/SKILL.md'))
    },
    })
    await owner.await()
    expect((await ctx.skills.list()).map(item => item.name)).toContain('daily-report')
    const loaded = await ctx.skills.get('daily-report')
    expect(loaded?.content).toContain('由本人选择保存草稿、确认提交或取消')
    expect(loaded?.content).toContain('first call work_records_daily_report_availability')
    const packaged = await readFile(resolve(packageRoot, 'skills/daily-report/SKILL.md'), 'utf8')
    expect(packaged).not.toContain('work_records_')
    await owner.dispose()
    expect((await ctx.skills.list()).map(item => item.name)).not.toContain('daily-report')
  } finally { await ctx.fiber.dispose() }
})

it('实际技能注册表能发现周报技能，并要求唯一项目匹配或人工补选', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(Skills)
    const owner = ctx.plugin({ inject: ['skills'], apply(scope: Context) {
      registerWeeklySkill(scope, resolve(packageRoot, 'skills/weekly-report/SKILL.md'))
    },
    })
    await owner.await()
    expect((await ctx.skills.list()).map(item => item.name)).toContain('weekly-report')
    const loaded = await ctx.skills.get('weekly-report')
    expect(loaded?.content).toContain('只有唯一命中才自动填入项目')
    expect(loaded?.content).toContain('project_matches')
    await owner.dispose()
    expect((await ctx.skills.list()).map(item => item.name)).not.toContain('weekly-report')
  } finally { await ctx.fiber.dispose() }
})
