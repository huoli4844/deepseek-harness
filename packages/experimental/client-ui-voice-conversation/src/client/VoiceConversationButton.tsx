/** 输入区右侧的连续语音对话开关：电话图标，无文字，点一次进入常开监听。 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { VoiceConversationInjected } from './contract.ts'
import { NS } from './locales.ts'
import { useSnapshot } from './use-snapshot.ts'
import css from './voice-conversation.module.css'

/** 开关组件属性：会话身份、注入能力与文案。 */
export type VoiceConversationButtonProps =
  Pick<PropsRuntime<'conversation.input.trailing'>, 'sessionId'>
  & PropsLocale<typeof NS>
  & InjectFace<VoiceConversationInjected>

/**
 * 电话听筒图标；图标资源不在 primitives 中，这里使用本地内联 SVG。
 * @param props.size - 边长像素。
 */
function PhoneIcon({ size }: { readonly size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path fill="currentColor" d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2z" />
    </svg>
  )
}

/** 渲染开关按钮；开启后按钮高亮并标注当前阶段。 */
export function VoiceConversationButton({ sessionId, controllerOf, t }: VoiceConversationButtonProps) {
  const controller = controllerOf(sessionId)
  const view = useSnapshot(controller)
  const active = view.phase !== 'idle'
  const label = t(active ? 'stop' : 'start')
  return (
    <Tooltip label={label} side="top" portal>
      <span className={css.triggerAnchor}>
        <Button className={css.trigger} size="sm" type="button"
          aria-label={label} aria-pressed={active} data-phase={view.phase}
          onMouseDown={(event) => { event.preventDefault() }}
          onClick={() => { void (active ? controller.stop() : controller.start()) }}>
          <PhoneIcon size={16} />
        </Button>
      </span>
    </Tooltip>
  )
}
