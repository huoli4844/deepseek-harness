/** 为新增表单和独立的能力查询注册技能。宿主注入工具绑定，随包技能仅描述员工流程。 */
import type { Context } from '@deepseek-ai/cordis'
import { readFile } from 'node:fs/promises'

interface BundledSkill {
  readonly name: string
  readonly description: string
  readonly path: string
  readonly rank: number
  readonly guidance: string
}

/** 注册随包技能，宿主可补充调用指引。 */
export function registerBusinessSkill(ctx: Context, skill: BundledSkill): void {
  const { name, description, path, rank, guidance } = skill
  ctx.skills.registerProvider(() => ({
    name,
    async list() {
      await readFile(path, 'utf8')
      return { complete: true, candidates: [{ name, description, provider: name, source: 'bundled',
        rank, locator: path, invocation: { userInvocable: true, modelInvocable: true } }] }
    },
    async get(candidate, options) {
      const raw = await readFile(path, { encoding: 'utf8', signal: options.signal })
      const { rank: _rank, locator: _locator, ...summary } = candidate
      return { ...summary, content: raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '') + '\n\n' + guidance }
    },
  }))
}

const createCapabilityGuidance = '宿主绑定：新增时先调用 business_find_create_target 核对该对象的新增权限和能力，传业务名称或云端目录声明的别名。'
  + '查询、导出、新增、编辑、删除、提交、审批等涉及业务数据的动作都先验权。非新增用 business_find_service_operations 按对象与方法查找，只有匹配到具体动作且 permission_state 为 permission_granted 才能继续。仍须使用工作台支持的已授权动作。'
  + '询问整体新增能力时，先查询实时服务目录并按具体业务核对，不根据数据库表数量推断可办理的业务。'
  + '名称不明时，可用已获授权的只读目录核对对象名称。'
  + '只有 form_ready 表示宿主已确认当前员工的新增权限且表单可用。此时才用 fields、required、options 和 field_guide 准备资料。'
  + 'preview_ready 表示宿主开启了联调预览，可以用测试资料打开预览表单并模拟保存。说明不会写入业务数据，不报告为实际办理成功。'
  + 'permission_denied 表示未获授权，permission_unverified 表示无法核实。两种情况均停止办理，不查询业务记录、下载模板、查重、预填或调用其他入口。权限树只用于核对动作编码和映射。'
  + '若返回 operation_id，原样传给 open_form，并将已知字段放入 content，字段值用文本。本人确认后的请求仍由后台鉴权。'
  + 'documented 表示目录已发现新增接口，但当前对话动态表单未就绪；按 reason 逐字解释缺少的字段、权限、回执或路径支持。此状态只描述对话动态表单，不代表工作台独立业务页面未接入。不得声称没有任何表单或要求用户批准源码接入，除非已核实独立页面也不存在且用户明确要求开发。仅知道数据库表或未匹配到表单时，不推断该业务只读，也不声称存在未核实的专用表单。'
  + 'ambiguous 时请员工确认对象，unknown 表示现有目录无法确认，catalog_unavailable 表示暂时无法检查云端目录。能力查询只报告结果。'

/** 注册能力查询和业务登记技能，二者共用同一个宿主查询入口。 */
export function registerBusinessCreationSkills(ctx: Context, skills: {
  readonly create: string
  readonly capabilities: string
}): void {
  registerBusinessSkill(ctx, {
    name: 'yuanshu-business-record-create', description: '新建业务记录。员工直接给资料要求新建，或确认按前文资料新建时，打开预填复核表单。',
    path: skills.create, rank: 580,
    guidance: createCapabilityGuidance + '明确要求新增时，按 form_ready 打开真实复核表单，按 preview_ready 打开联调预览。'
      + '继续先前未保存的事项时，重查办理能力，并沿用同一事项在前文明确给出的资料。'
      + '下载模板或上传时传空内容；描述预填沿用同一登记事项已知值，占位或未知内容省略。表单打开不代表保存成功。',
  })
  registerBusinessSkill(ctx, {
    name: 'yuanshu-business-capabilities', description: '查询指定业务能否新增，以及需要准备哪些资料。',
    path: skills.capabilities, rank: 580, guidance: createCapabilityGuidance,
  })
}
