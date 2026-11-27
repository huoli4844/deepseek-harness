/**
 * 客户端挂载：注册文案、按会话创建控制器、把开关与状态条挂进输入区。
 *
 * 边界：插件只消费 `remote.speech`、`sessions`、`slots`、`locale` 四个服务；
 * 与自带语音输入（`conversation.input.activity`）占用不同插槽，互不覆盖。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-experimental-api-speech-to-text/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ContinuousCapture } from './capture.ts'
import type { VoiceConversationInjected } from './contract.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh } from './locales.ts'
import { VoiceConversationController } from './orchestrator.ts'
import { lastAssistantMessage } from './session-watch.ts'
import { createBrowserSpeaker } from './tts.ts'
import { VoiceConversationButton } from './VoiceConversationButton.tsx'
import { VoiceConversationPanel } from './VoiceConversationPanel.tsx'
import { audioBase64 } from './wav.ts'

/** 插件级服务依赖：语音识别 Remote、会话对象层、插槽与文案。 */
export const inject = ['remote', 'sessions', 'slots', 'locale']

/** 已可直接识别的准备阶段。 */
const READY_PHASES = new Set(['ready', 'standby'])

/**
 * 确保默认识别器就绪；未就绪时启动宿主侧准备任务并等待其结束。
 * @param ctx - 已注入 remote.speech 的客户端运行时。
 * @param signal - 用户取消时中止等待（宿主侧任务由 cancelPreparation 负责）。
 */
async function ensureSpeechReady(ctx: Context, signal: AbortSignal): Promise<void> {
  try {
    await waitForSpeechReady(ctx, signal)
  } catch (error) {
    console.error('[voice-conversation] speech readiness failed', error)
    throw error
  }
}

/** 读取识别器目录并在需要时等待准备完成。 */
async function waitForSpeechReady(ctx: Context, signal: AbortSignal): Promise<void> {
  const catalogResult = await ctx.remote.speech.catalog()
  if (!catalogResult.ok) throw new Error(catalogResult.error.code)
  const catalog = catalogResult.value
  const selected = catalog.providers.find(view => view.id === catalog.selection.providerId)
    ?? catalog.providers[0]
  if (selected === undefined) throw new Error('speech provider unavailable')
  if (READY_PHASES.has(selected.preparation.phase)) return
  try {
    await ctx.remote.speech.prepare(selected.id)
  } catch (error) {
    console.error('[voice-conversation] speech prepare call failed', error)
    throw error
  }
  const deadline = Date.now() + 30 * 60_000
  for (;;) {
    if (signal.aborted) throw new DOMException('speech preparation aborted', 'AbortError')
    if (Date.now() > deadline) throw new Error('speech preparation timed out')
    await new Promise<void>((resolve) => { setTimeout(resolve, 500) })
    const next = await ctx.remote.speech.catalog()
    if (!next.ok) throw new Error(next.error.code)
    const current = next.value.providers.find(view => view.id === selected.id)
    const phase = current?.preparation.phase ?? 'failed'
    if (READY_PHASES.has(phase)) return
    if (phase === 'failed' || phase === 'cancelled') {
      console.error('[voice-conversation] speech preparation stopped', current?.preparation)
      throw new Error('speech preparation failed')
    }
  }
}

/** 在服务就绪后注册 UI 贡献。 */
function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }))
  const controllers = new Map<string, VoiceConversationController>()

  const controllerOf = (sessionId: SessionId): VoiceConversationController => {
    const existing = controllers.get(sessionId)
    if (existing !== undefined) return existing
    const controller = new VoiceConversationController({
      prepare: signal => ensureSpeechReady(ctx, signal),
      createCapture: handlers => new ContinuousCapture({
        onSegment: (wav) => { handlers.onSegment(wav) },
        onSpeechChange: (speaking) => { handlers.onSpeechChange(speaking) },
        onError: (failure) => { handlers.onError(failure.kind) },
      }),
      transcribe: async (wav, signal) => {
        const result = await ctx.remote.speech.transcribe({ audioBase64: audioBase64(wav) }, signal)
        if (!result.ok) {
          console.error('[voice-conversation] speech transcription failed', result.error.code)
          throw new Error(result.error.code)
        }
        return result.value.text
      },
      createSpeaker: () => createBrowserSpeaker(),
      readAssistantText: () => {
        const binding = ctx.sessions.binding(sessionId)
        if (binding === undefined) return ''
        return lastAssistantMessage(binding.eventSource.getSnapshot().entries)?.text ?? ''
      },
    })
    controllers.set(sessionId, controller)
    return controller
  }

  const actions: VoiceConversationInjected = { controllerOf }
  ctx.effect(() => () => {
    for (const controller of controllers.values()) controller.dispose()
    controllers.clear()
  })

  // 紧跟在自带语音输入之后、发送按钮之前；不占用 activity 这个单占位插槽。
  ctx.slots.inject('conversation.input.trailing', () => ctx.slots.register({
    name: 'conversation.input.trailing', id: 'voice-conversation', order: 10, locale: NS, inject: () => actions,
  }, VoiceConversationButton))
  // 输入卡上方的状态条：同时把当前输入框能力同步给控制器。
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'voice-conversation', order: 20, locale: NS, inject: () => actions,
  }, VoiceConversationPanel))
}

/**
 * 安装连续语音对话的浏览器贡献。
 * @param ctx - 客户端运行时。
 * @returns 四个服务全部就绪后完成。
 */
export async function mountVoiceConversation(ctx: Context): Promise<void> {
  await ctx.inject(['remote.speech', 'sessions', 'slots', 'locale'], registerUi)
}
