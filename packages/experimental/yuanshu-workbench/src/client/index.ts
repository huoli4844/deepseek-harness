/** Native DSH main-panel and sidebar contribution; no document injection. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-file-drag/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { createElement, Fragment } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { en as doclibEn, zh as doclibZh } from '@deepseek-ai/dsh-yuanshu-doclib/client'
import type { DoclibPanelProps } from '@deepseek-ai/dsh-yuanshu-doclib/client'
import { Workbench, WorkbenchIcon } from './app/Workbench.tsx'
import { AssistantWorkspaceDock } from './app/AssistantWorkspace.tsx'
import { loadOemBrand, OemBrandMark, OemBrandName, PRODUCT_TITLE_EVENT } from './app/OemBrand.tsx'
import { createWorkbenchStore } from './core/model.ts'
import { en, zh } from './core/locales/locales.ts'
import { startTodoReminders } from './modules/todos/todos-reminder.ts'
import { assistantAccountKey, bindAssistantSession, BusinessFormError, ConversationBusinessForms, createCredentialGuard } from './modules/business-forms/index.ts'
import { initializeEnterpriseLogin } from './modules/business-forms/source.ts'
import { deleteSkillPackage, downloadSkillPackage, fetchSkillPackages, installSkillPackage, uploadLocalSkill, uploadSkillPackageFile } from './app/skill-store-api.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shaoshi role dashboards and shared demo workspace. */
    'yuanshu.workbench': keyof typeof en
    /** 资料库面板文案随工作台统一注册，避免重复注册与加载顺序问题。 */
    'yuanshu.doclib': keyof typeof doclibEn
  }

  interface SlotMap {
    /** Embedded native Conversation owned by the YuanShu assistant overlay. */
    'yuanshu.assistant.conversation': { kind: 'single'; scope: 'session' }
  }
}

/** 工作台会话使用的专用 Agent preset：仅它可看到元枢 MCP 工具。 */
const WORKBENCH_AGENT_PRESET = 'yuanshu'
const ASSISTANT_SESSION_KEY = 'dsh.yuanshu.workbench.assistant-sessions.v2'
const ASSISTANT_SOURCE = 'yuanshuWorkbench'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    yuanshuWorkbench: unknown
  }
}

function FixedConversationView(props: ConversationViewsProps) {
  return createElement(Fragment, null, props.renderSlot('conversation.session', { view: 'chat' }))
}

function AssistantConversation(props: PropsRuntime<'yuanshu.assistant.conversation'> & PropsRenderFactories) {
  const { sessionId, useSession, useConversation, useSessions, renderFactorySlot } = props
  const session = useSession(value => value)
  const conversation = useConversation(value => value)
  const active = conversation.activeTargets.size > 0
    || (!session.blank && !session.awaitingFirstTurn)
    || session.running
  const shellPhase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
  const summaryBlank = useSessions(state => state.byId[sessionId]?.blank)
  const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true)
  return renderFactorySlot('conversation.content', {
    variant: 'embedded',
    phase: hero ? 'hero' : 'active',
    hero,
    onWorkspaceSelected: () => Promise.resolve(),
  }, { slots: { views: FixedConversationView } })
}

function readAssistantSessions(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ASSISTANT_SESSION_KEY) ?? '{}')
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  } catch (_invalidStorage) {
    return {}
  }
}

/** Services needed to register, localize, leave the workbench, and read settings data. */
export const inject = [
  'slots', 'locale', 'layout', 'uiWorkspace', 'sessions', 'workspaces',
  // Remote 命名空间必须先声明 inject，访问 ctx.remote.<namespace> 才不会抛错。
  'remote', 'remote.pluginManager', 'remote.skills', 'remote.workspaceFiles', 'remote.session',
]

/**
 * Mount the optional browser workspace through the existing DSH slots.
 * @param ctx - Client context with layout, slots, and locale services.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const lifetime = new AbortController()
    void initializeEnterpriseLogin(lifetime.signal)
    return () => { lifetime.abort() }
  }, 'yuanshu: initialize enterprise login')
  const id = 'yuanshu-workbench' as MainPanelId
  ctx.effect(() => ctx.locale.register('yuanshu.workbench', { en, zh }), 'yuanshu: locale')
  ctx.effect(() => ctx.locale.register('yuanshu.doclib', { en: doclibEn, zh: doclibZh }), 'yuanshu: doclib locale')
  const t = ctx.locale.bind('yuanshu.workbench')
  ctx.effect(() => startTodoReminders(t), 'yuanshu: todo reminders')
  const doclibT = ctx.locale.bind('yuanshu.doclib')
  const store = createWorkbenchStore()
  const references = new Map<string, SessionReference>()
  const sessionsByRole = readAssistantSessions()
  // 用户在智能问答浮窗里切换选中的工作区；新建会话无来源工作区时归属这里。
  let selectedAssistantWorkspace: WorkspaceId | undefined
  const getAssistantSession = async (role: string, prompt?: string): Promise<SessionReference> => {
    const signal = AbortSignal.timeout(15_000)
    // 日报后台不可用时仍允许开始新对话，但不能复用尚未核实归属的旧会话。
    const account = await assistantAccountKey(signal).catch(() => undefined)
    const cacheKey = `${account ?? randomUUID()}:${role}`
    let reference = references.get(cacheKey)
    if (reference === undefined) {
      const existing = account === undefined ? undefined : sessionsByRole[cacheKey]
      const id = existing === undefined ? await ctx.sessions.create({ agentPreset: WORKBENCH_AGENT_PRESET }) : existing
      reference = references.get(cacheKey)
      if (reference === undefined) {
        reference = ctx.sessions.retain(id as never, { source: ASSISTANT_SOURCE, facets: { conversation: true } })
        references.set(cacheKey, reference)
        sessionsByRole[cacheKey] = reference.sessionId
        localStorage.setItem(ASSISTANT_SESSION_KEY, JSON.stringify(sessionsByRole))
      }
    }
    await reference.ready
    if (account !== undefined) {
      try { await bindAssistantSession(reference.sessionId, signal) }
      catch (error) {
        if (error instanceof BusinessFormError && error.newSessionRequired) {
          reference.release()
          const id = await ctx.sessions.create({ agentPreset: WORKBENCH_AGENT_PRESET })
          reference = ctx.sessions.retain(id, { source: ASSISTANT_SOURCE, facets: { conversation: true } })
          references.set(cacheKey, reference)
          await reference.ready
          await bindAssistantSession(reference.sessionId, signal)
          sessionsByRole[cacheKey] = reference.sessionId
          localStorage.setItem(ASSISTANT_SESSION_KEY, JSON.stringify(sessionsByRole))
        } else throw error
      }
    }
    if (prompt !== undefined && prompt !== '') {
      const scoped = ctx.sessions.scope(reference.sessionId)
      const conversation = scoped?.get('conversation')
      if (conversation === undefined) throw new Error('Workbench conversation unavailable')
      await conversation.send(prompt)
    }
    return reference
  }
  ctx.effect(function* () {
    yield ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
      name: 'conversation.input.dock', id: 'yuanshu-assistant-workspace', order: 100,
    }, AssistantWorkspaceDock))
    yield ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
      name: 'conversation.input.overlay', id: 'yuanshu-daily-report', locale: 'yuanshu.workbench',
    }, props => createElement(ConversationBusinessForms, {
      ...props, blocks: ctx.get('conversation')?.blocks,
      onNewChat: async (signal: AbortSignal) => {
        const sameAccount = createCredentialGuard()
        const workspace = ctx.get('workspaces')?.list.getSnapshot().items.find(item => item.sessionIds.includes(props.sessionId))
        // 来源会话无工作区时，回落到用户在智能问答浮窗里切换选中的工作区。
        const workspaceId = workspace?.workspaceId ?? selectedAssistantWorkspace
        const id = await ctx.sessions.create({
          ...(workspaceId === undefined ? {} : { workspaceId }),
          agentPreset: WORKBENCH_AGENT_PRESET,
        })
        signal.throwIfAborted()
        if (!sameAccount()) throw new BusinessFormError(401)
        await bindAssistantSession(id, signal)
        signal.throwIfAborted()
        if (!sameAccount()) throw new BusinessFormError(401)
        ctx.uiWorkspace.openSession(id)
      },
    })))
    yield ctx.slots.inject('yuanshu.assistant.conversation', () => ctx.slots.register({
      name: 'yuanshu.assistant.conversation',
    }, AssistantConversation))
    yield ctx.slots.inject('main', () => {
      const dispose = ctx.slots.register(
        {
          name: 'main',
          key: id,
          children: { 'yuanshu.assistant.conversation': { kind: 'single', scope: 'session' } },
          locale: 'yuanshu.workbench',
          store,
          inject: () => ({
            openAssistant: (role: string, prompt?: string) => getAssistantSession(role, prompt),
            openWorkspace: (workspaceId: WorkspaceId) => {
              // 只切换智能问答浮窗的当前工作区上下文（后续新建会话归属该工作区），
              // 不调用宿主跳转，避免整个主区被切到默认对话页。
              selectedAssistantWorkspace = workspaceId
              return Promise.resolve()
            },
            openSession: (sessionId: SessionId) => {
              ctx.uiWorkspace.openSession(sessionId)
              return Promise.resolve()
            },
            onReturn: () => {
              ctx.layout.selectPanel(null)
            },
            doclib: (() => {
              // 资料库面板依赖工作区 Remote 服务；缺少时由工作台展示不可用提示。
              const remote = ctx.get('remote') as DoclibPanelProps['remote'] | undefined
              return remote === undefined ? undefined : {
                t: doclibT,
                sessions: ctx.sessions,
                remote,
                fileActions: ctx.get('fileActions') as DoclibPanelProps['fileActions'],
                // 原生工作区列表用于左栏显示名称与切换工作区；缺失时资料库只展示当前工作区。
                workspaces: ctx.get('workspaces') as DoclibPanelProps['workspaces'],
                // 文件拖拽服务让资料库文件可以直接拖进右侧对话输入框。
                fileDrag: ctx.get('fileDrag')?.actions,
              }
            })(),
            settings: (() => {
              // 设置弹窗读取后台插件清单；缺少 Remote 服务时由弹窗展示不可用。
              const remote = ctx.get('remote') as {
                pluginManager?: {
                  listBundles?: () => Promise<{
                    ok: boolean
                    value?: readonly {
                      name: string
                      version?: string
                      enabled?: boolean
                      installed?: boolean
                      availability?: string
                      description?: string
                    }[]
                  }>
                }
                skills?: {
                  list?: (input: { sessionId: string }, signal?: AbortSignal) => Promise<{
                    ok: boolean
                    value?: {
                      skills: readonly {
                        name: string
                        description: string
                        modelInvocable: boolean
                        path?: string
                      }[]
                    }
                  }>
                }
              } | undefined
              return {
                loadPlugins: async () => {
                  const manager = remote?.pluginManager
                  if (manager?.listBundles === undefined) return []
                  const result = await manager.listBundles()
                  if (!result.ok || result.value === undefined) return []
                  // 只展示真正可用的包：profile 依赖（installed）与 profile 已选中的随包内置项（enabled）；
                  // 安装目录里存在但未选中的可选包不算「已安装插件」。
                  return result.value
                    .filter(item => item.installed === true || item.enabled === true)
                    .map(item => ({
                      name: item.name,
                      ...(item.version === undefined ? {} : { version: item.version }),
                      ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
                      installed: item.installed === true,
                      ...(item.availability === undefined ? {} : { availability: item.availability }),
                      ...(item.description === undefined ? {} : { description: item.description }),
                    }))
                },
                loadSkills: async (sessionId?: string) => {
                  const skills = remote?.skills
                  if (sessionId === undefined || skills?.list === undefined) return []
                  const result = await skills.list({ sessionId }, AbortSignal.timeout(15_000))
                  if (!result.ok || result.value === undefined) return []
                  return result.value.skills.map(skill => ({
                    name: skill.name,
                    description: skill.description,
                    modelInvocable: skill.modelInvocable,
                    ...(skill.path === undefined ? {} : { path: skill.path }),
                  }))
                },
                // 技能包走后端代理，与是否配置 remote 无关；清单与文件操作由宿主转发。
                loadSkillPackages: () => fetchSkillPackages(),
                downloadSkillPackage: (id: string, name: string) => downloadSkillPackage(id, name),
                installSkillPackage: (id: string) => installSkillPackage(id),
                uploadSkillPackage: (file: File) => uploadSkillPackageFile(file),
                // 本机技能直接打包上传，避免用户先手动压缩。
                uploadLocalSkill: (name: string) => uploadLocalSkill(name),
                deleteSkillPackage: (id: string) => deleteSkillPackage(id),
              }
            })(),
          }),
        },
        Workbench,
      )
      ctx.layout.selectPanel(id)
      return dispose
    })
    yield ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register(
        {
          name: 'sidebar.panellist',
          id,
          order: 15,
          locale: 'yuanshu.workbench',
          label: () => t('panel'),
        },
        WorkbenchIcon,
      ),
    )
    yield ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
      name: 'sidebar.brand.mark',
    }, OemBrandMark))
    yield ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
      name: 'sidebar.brand.name',
    }, () => createElement(OemBrandName, { t })))
    void loadOemBrand().then((brand) => {
      if (brand !== null) window.dispatchEvent(new CustomEvent(PRODUCT_TITLE_EVENT, { detail: t('brand.title', { name: brand.systemName }) }))
    })
  })
  ctx.effect(() => () => {
    for (const reference of references.values()) reference.release()
    references.clear()
  }, 'yuanshu: assistant sessions')
}
