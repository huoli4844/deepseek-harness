/** 日报场景组装：连接真实后台、会话归属、场景工具和技能；不包含 JSX 或 SQL。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { readFile } from 'node:fs/promises'
import { registerDailyTools } from './daily-report-tools.ts'
import { registerDailyRoutes } from './daily-report-routes.ts'
import { BusinessForms } from './plugins/business-forms/index.ts'
import { WorkRecords } from './plugins/work-records/index.ts'
import { WorkJournal } from './plugins/work-journal/index.ts'

/** 以现有包内独立模块启用场景，插件卸载时自动撤销工具、路由与临时凭证。 */
export function applyDailyReport(ctx: Context, api: string, skillPath: string): void {
  ctx.inject(['webServer', 'tools', 'skills', 'sessionQuery', 'sessions'], (scope) => {
    const records = new WorkRecords(api)
    const forms = new BusinessForms(records)
    scope.effect(() => () => { forms.dispose() }, 'daily-report: clear runtime')
    const journal = new WorkJournal(scope)
    journal.install()
    registerDailyRoutes(scope, records, forms, journal)
    registerDailyTools(scope, forms, journal)
    registerDailySkill(scope, skillPath)
  })
}


/** 注册随包员工技能；只在插件宿主中保留发现与加载细节。 */
export function registerDailySkill(ctx: Context, skillPath: string): void {
  ctx.skills.registerProvider(() => ({
    name: 'yuanshu-work-records',
    async list() {
      await readFile(skillPath, 'utf8')
      return { complete: true, candidates: [{ name: 'daily-report', description: '根据本人今天的对话和成果整理工作日报，打开预填表单，由本人确认保存或提交。',
        provider: 'yuanshu-work-records', source: 'bundled', rank: 600, locator: skillPath,
        invocation: { userInvocable: true, modelInvocable: true },
        resourceBase: { kind: 'directory', path: skillPath.slice(0, skillPath.lastIndexOf('/')) } }] }
    },
    async get(candidate, options) {
      const raw = await readFile(skillPath, { encoding: 'utf8', signal: options.signal })
      const { rank: _rank, locator: _locator, ...summary } = candidate
      const workflow = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
      // 技术绑定属于宿主，不写入只包含员工业务流程的技能发布文件。
      const binding = 'Host capability binding: first call work_records_daily_report_availability. '
        + 'If the capability is missing or unavailable, explain that the daily report is unavailable and stop. '
        + 'Do not ask the employee for technical paths or substitute local files. '
        + 'If available, use work_evidence_today to read LOCAL workbench conversation, execution and outcome records, '
        + 'then work_records_open_daily_report to open the review form. '
        + 'When the employee requests a recent time range, pass the corresponding lookback_minutes to the local evidence tool. '
        + 'Keep the chosen range in the summary. The employee must confirm submission in the form. '
        + 'Do not query MCP knowledge sessions, remote workbench records, company data or web search to reconstruct today’s local work. '
        + 'Do not claim plans, assistant suggestions or failed attempts as completed outcomes. '
        + 'A successful lookup alone does not prove a work item was delivered. '
        + 'Only work_records_daily_report_status can confirm the human decision; never submit via other tools.'
      return { ...summary, content: `${workflow}\n\n${binding}` }
    },
  }))
}
