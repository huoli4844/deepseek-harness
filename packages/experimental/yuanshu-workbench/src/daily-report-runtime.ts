/** 日报场景组装：连接真实后台、会话归属、场景工具和技能；不包含 JSX 或 SQL。 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { readFile } from 'node:fs/promises'
import { PersonalPageDrafts } from './personal-page-drafts.ts'
import { registerDailyTools } from './daily-report-tools.ts'
import { registerDailyRoutes } from './daily-report-routes.ts'
import { BusinessForms } from './plugins/yuanshu-business-forms/index.ts'
import { WorkRecords } from './plugins/yuanshu-work-records/index.ts'
import { WorkJournal } from './plugins/yuanshu-work-journal/index.ts'
import { registerEquipmentIntake } from './plugins/yuanshu-equipment-intake/index.ts'
import { registerEmployeeAccessTool } from './employee-access-tool.ts'
import { registerApiQueryTools } from './api-catalog/tools.ts'
import type { EmployeeAccessStore } from './employee-access.ts'
import { registerProjectReports } from './plugins/yuanshu-project-reports/index.ts'
import { createSwaggerLookup } from './plugins/yuanshu-equipment-intake/swagger-create-catalog.ts'

/** 以现有包内独立模块启用场景，插件卸载时自动撤销工具、路由与临时凭证。 */
export function applyDailyReport(ctx: Context, api: string, skillPath: string,
  businessSkills: Parameters<typeof registerEquipmentIntake>[2],
  onApiError?: (req: IncomingMessage, res: ServerResponse) => void, access?: EmployeeAccessStore): void {
  ctx.inject(['webServer', 'tools', 'skills', 'sessionQuery', 'sessions'], (scope) => {
    const records = new WorkRecords(api)
    const forms = new BusinessForms(records)
    scope.effect(() => () => { forms.dispose() }, 'daily-report: clear runtime')
    const journal = new WorkJournal(scope)
    journal.install()
    const equipment = registerEquipmentIntake(scope, forms, businessSkills, api, access)
    const personalPages = new PersonalPageDrafts()
    personalPages.register(scope, forms)
    const swaggerLifetime = new AbortController()
    scope.effect(() => () => { swaggerLifetime.abort() }, 'daily-report: close swagger lookup')
    const projectReports = registerProjectReports(scope, forms, records, api, access,
      createSwaggerLookup(api, swaggerLifetime.signal))
    registerDailyRoutes(scope, records, forms, journal, equipment, api, onApiError, personalPages, projectReports)
    registerDailyTools(scope, forms, journal)
    registerApiQueryTools(scope, forms, api)
    if (access) registerEmployeeAccessTool(scope, forms, access)
    registerWorkReportSkill(scope, skillPath)
  })
}

/** 注册同一个工作报告技能，按报告周期绑定宿主工具。 */
export function registerWorkReportSkill(ctx: Context, skillPath: string): void {
  const name = 'yuanshu-work-report'
  const description = '写个人日报、个人周报或项目周报，汇总工作依据并由本人复核。'
  ctx.skills.registerProvider(() => ({
    name,
    async list() {
      await readFile(skillPath, 'utf8')
      return { complete: true, candidates: [{ name, description, provider: name, source: 'bundled',
        rank: 600, locator: skillPath, invocation: { userInvocable: true, modelInvocable: true } }] }
    },
    async get(candidate, options) {
      const raw = await readFile(skillPath, { encoding: 'utf8', signal: options.signal })
      const { rank: _rank, locator: _locator, ...summary } = candidate
      const workflow = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
      const daily = 'Host capability binding: first call work_records_existing_daily_report using the verified conversation. Only when the lookup confirms no record or the employee explicitly asks to resume a saved draft, check work_records_daily_report_availability. '
        + 'Show the status, available timestamps in Asia/Shanghai and saved content for today when a report exists. Stop for submitted reports or draft lookups. An explicit request to continue a saved draft can use its existing form. If lookup fails, stop. '
        + 'If the capability is missing or unavailable, explain that the daily report is unavailable and stop. '
        + 'Do not ask the employee for technical paths or substitute local files. '
        + 'If available, use work_evidence_today to read LOCAL workbench conversation, execution and outcome records, '
        + 'including the current conversation name, workspace and project matches from the current-tenant project master data; '
        + 'then work_records_open_daily_report to open the review form. '
        + 'When the employee requests a recent time range, pass the corresponding lookback_minutes to the local evidence tool. '
        + 'Keep the chosen range in the summary. The employee must confirm submission in the form. '
        + 'If opening returns already-submitted, read work_records_existing_daily_report again to show the submitted content and submission time in Asia/Shanghai. '
        + 'Do not query MCP knowledge sessions, remote workbench records, company data or web search to reconstruct today’s local work. '
        + 'Do not claim plans, assistant suggestions or failed attempts as completed outcomes. '
        + 'A successful lookup alone does not prove a work item was delivered. '
        + 'Only work_records_daily_report_status can confirm the human decision; never submit via other tools.'
      const weekly = 'Host capability binding: first call work_records_existing_weekly_report with the selected Beijing Monday. Show the status, available timestamps in Asia/Shanghai and saved content for that week when a report exists. Stop for submitted reports or draft lookups. If lookup fails, stop. If no report exists or the employee explicitly asks to resume a saved draft, check work_records_weekly_report_availability before calling work_evidence_week with the selected Monday. If opening conflicts, look up the saved report again. Use only its submitted daily reports, local journal, conversation context and current-tenant project master data. Apply project_matches: use a project only when there is one unique code or full-name match; otherwise leave the project empty for the employee to choose from the returned project options. Then call work_records_open_weekly_report. The employee must edit, delete or add items and confirm save or submit in the A2UI form. Only work_records_weekly_report_status proves the result.'
      const project = 'For explicit project weekly reports, call work_records_project_week_evidence and follow next_offset. Treat history as evidence only. '
        + 'List the projects found in this week’s reports and conversations, then ask whether to write only the employee-named projects or every involved project; do not infer scope. '
        + 'Draft the content using report_field_definitions and fill only editable fields; period, report type and status are filled by the workbench, and key_metrics is declared but not collected. Show the draft content and ask Excel or one-by-one review. '
        + 'Excel only exports and submits nothing; review opens A2UI forms one project at a time. Then call work_records_prepare_project_reports with the chosen mode and projects. Report already_exists separately. Opening a batch does not establish submission.'
      return { ...summary, content: [workflow, '按用户指定的报告类型只执行一个分支。写周报默认指个人周报。', '日报：' + daily, '个人周报：' + weekly, '项目周报：' + project].join('\n\n') }
    },
  }))
}
