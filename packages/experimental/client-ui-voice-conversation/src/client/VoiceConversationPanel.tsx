/**
 * 输入卡上方的语音对话状态条。
 *
 * 该条目始终挂载（列表插槽），因此同时承担“把输入框能力交给控制器”的接线；
 * 只有控制器不处于 idle 时才渲染可见内容。
 */
import { useEffect } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { VoiceConversationInjected } from './contract.ts'
import { NS, type VoiceConversationKey } from './locales.ts'
import type { VoiceConversationFailure, VoiceConversationPhase } from './model.ts'
import { useSnapshot } from './use-snapshot.ts'
import css from './voice-conversation.module.css'

/** 非 idle、非 error 阶段的文案 key。 */
const STATUS_KEY: Record<Exclude<VoiceConversationPhase, 'idle' | 'error'>, VoiceConversationKey> = {
  preparing: 'preparing',
  listening: 'listening',
  transcribing: 'transcribing',
  sending: 'sending',
  thinking: 'thinking',
  speaking: 'speaking',
}

/** 失败原因的文案 key。 */
const FAILURE_KEY: Record<VoiceConversationFailure, VoiceConversationKey> = {
  permission: 'failure.permission',
  unavailable: 'failure.unavailable',
  prepare: 'failure.prepare',
  transcribe: 'failure.transcribe',
  send: 'failure.send',
  interrupted: 'failure.interrupted',
}

/** 状态条属性：插槽标准能力、注入能力与文案。 */
export type VoiceConversationPanelProps =
  PropsRuntime<'conversation.input.dock'>
  & PropsLocale<typeof NS>
  & InjectFace<VoiceConversationInjected>

/** 渲染状态条，并把当前输入框是否可发送同步给控制器。 */
export function VoiceConversationPanel({ sessionId, session, input, inputActions, controllerOf, t }: VoiceConversationPanelProps) {
  const controller = controllerOf(sessionId)
  const view = useSnapshot(controller)
  const locked = input.phase !== 'plain' || session.running
  useEffect(() => {
    controller.setComposer({
      locked,
      send: (text) => {
        const span = inputActions.captureInsertion()
        if (!inputActions.insertText(text, span)) return false
        inputActions.submit()
        return true
      },
    })
  }, [controller, locked, inputActions])
  // 会话运行状态是回合结束的权威信号；由面板每次渲染同步，避免错过订阅时机。
  useEffect(() => { controller.setSessionRunning(session.running) }, [controller, session.running])
  useEffect(() => () => { controller.setComposer(undefined) }, [controller])
  if (view.phase === 'idle') return null
  const failure = view.failure
  const statusKey = view.phase === 'error'
    ? FAILURE_KEY[failure ?? 'transcribe']
    : STATUS_KEY[view.phase]
  return (
    <div className={css.panel} role="status" aria-live="polite" aria-label={t('panelTitle')}>
      <span className={css.state}>
        <span className={css.dot} data-phase={view.phase} />
        {t(statusKey)}
      </span>
      {failure === undefined && view.transcript !== ''
        ? <span className={css.transcript} title={view.transcript}>{t('lastHeard', { text: view.transcript })}</span>
        : null}
      <Button className={css.stopButton} size="sm" type="button" onClick={() => { void controller.stop() }}>
        {t('stop')}
      </Button>
    </div>
  )
}
