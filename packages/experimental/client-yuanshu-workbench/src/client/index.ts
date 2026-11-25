/** Native DSH main-panel and sidebar contribution; no document injection. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { createElement, Fragment } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { Workbench, WorkbenchIcon } from './app/Workbench.tsx'
import { loadOemBrand, OemBrandMark, OemBrandName, PRODUCT_TITLE_EVENT } from './app/OemBrand.tsx'
import { createWorkbenchStore } from './core/model.ts'
import { en, zh } from './core/locales/locales.ts'
import { assistantAccountKey, bindAssistantSession, BusinessFormError, ConversationBusinessForms, createCredentialGuard } from './modules/business-forms/index.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shaoshi role dashboards and shared demo workspace. */
    'yuanshu.workbench': keyof typeof en
  }

  interface SlotMap {
    /** Embedded native Conversation owned by the YuanShu assistant overlay. */
    'yuanshu.assistant.conversation': { kind: 'single'; scope: 'session' }
  }
}

const ASSISTANT_SESSION_KEY = 'dsh.yuanshu.workbench.assistant-sessions'
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

/** Services needed to register, localize, and leave the workbench. */
export const inject = ['slots', 'locale', 'layout', 'uiWorkspace', 'sessions']

/**
 * Mount the optional browser workspace through the existing DSH slots.
 * @param ctx - Client context with layout, slots, and locale services.
 */
export function apply(ctx: Context): void {
  const id = 'yuanshu-workbench' as MainPanelId
  ctx.effect(() => ctx.locale.register('yuanshu.workbench', { en, zh }), 'yuanshu: locale')
  const t = ctx.locale.bind('yuanshu.workbench')
  const store = createWorkbenchStore()
  const references = new Map<string, SessionReference>()
  const sessionsByRole = readAssistantSessions()
  const getAssistantSession = async (role: string, prompt?: string): Promise<SessionReference> => {
    const signal = AbortSignal.timeout(15_000)
    // 日报后台不可用时仍允许开始新对话，但不能复用尚未核实归属的旧会话。
    const account = await assistantAccountKey(signal).catch(() => undefined)
    const cacheKey = `${account ?? randomUUID()}:${role}`
    let reference = references.get(cacheKey)
    if (reference === undefined) {
      const existing = account === undefined ? undefined : sessionsByRole[cacheKey]
      const id = existing === undefined ? await ctx.sessions.create() : existing
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
          const id = await ctx.sessions.create()
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
    yield ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
      name: 'conversation.input.overlay', id: 'yuanshu-daily-report', locale: 'yuanshu.workbench',
    }, props => createElement(ConversationBusinessForms, {
      ...props, blocks: ctx.get('conversation')?.blocks,
      onNewChat: async (signal: AbortSignal) => {
        const sameAccount = createCredentialGuard()
        const workspace = ctx.get('workspaces')?.list.getSnapshot().items.find(item => item.sessionIds.includes(props.sessionId))
        const id = await ctx.sessions.create(workspace === undefined ? undefined : { workspaceId: workspace.workspaceId })
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
            onReturn: () => {
              ctx.layout.selectPanel(null)
            },
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
    }, OemBrandName))
    void loadOemBrand().then((brand) => {
      if (brand !== null) window.dispatchEvent(new CustomEvent(PRODUCT_TITLE_EVENT, { detail: brand.title }))
    })
  })
  ctx.effect(() => () => {
    for (const reference of references.values()) reference.release()
    references.clear()
  }, 'yuanshu: assistant sessions')
}
