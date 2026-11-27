/**
 * 回答朗读：把助手文本交给浏览器 speechSynthesis 播报。
 *
 * 边界：不判断何时朗读、不处理打断策略（由 orchestrator 决定），
 * 只负责单条文本的播放、取消与可用性判断。Electron 渲染进程可直接使用；
 * 中文发音取决于系统安装的语音包，缺失时按不可用处理。
 */

/** 朗读端口；测试可替换为假实现。 */
export interface Speaker {
  /** 当前环境是否具备语音合成能力。 */
  readonly available: boolean
  /** 播放一段文本，结束、被取消或出错时完成。 */
  speak(text: string): Promise<void>
  /** 立即停止当前朗读。 */
  cancel(): void
}

/** 读取页面语言作为朗读语言；找不到时退回中文。 */
function defaultLanguage(): string {
  if (typeof document !== 'undefined' && document.documentElement.lang !== '') return document.documentElement.lang
  if (typeof navigator !== 'undefined' && navigator.language !== '') return navigator.language
  return 'zh-CN'
}

/** 运行时可选的语音合成能力；lib.dom 把它们声明为必然存在，因此按可选能力探测。 */
interface SpeechCapability {
  readonly speechSynthesis?: SpeechSynthesis
  readonly SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance
}

/**
 * 创建浏览器语音合成器。
 * @param language - BCP 47 语言标签，例如 zh-CN。
 * @returns 单条播放的朗读端口。
 */
export function createBrowserSpeaker(language = defaultLanguage()): Speaker {
  const capability = globalThis as SpeechCapability
  const synth = capability.speechSynthesis
  const Utterance = capability.SpeechSynthesisUtterance
  const available = synth !== undefined && Utterance !== undefined
  let settle: (() => void) | undefined

  const finish = (): void => {
    const pending = settle
    settle = undefined
    pending?.()
  }

  return {
    available,
    speak(text: string): Promise<void> {
      if (synth === undefined || Utterance === undefined || text.trim() === '') return Promise.resolve()
      synth.cancel()
      return new Promise<void>((resolve) => {
        const utterance = new Utterance(text)
        utterance.lang = language
        utterance.onend = finish
        utterance.onerror = finish
        settle = resolve
        synth.speak(utterance)
      })
    },
    cancel(): void {
      if (synth === undefined) return
      synth.cancel()
      finish()
    },
  }
}
