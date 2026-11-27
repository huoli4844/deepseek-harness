/** Locale-owned messages shared by microphone preview and dictation. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { RecordingError } from './audio.ts'
import type { NS } from './locales.ts'

/** 桌面壳（Electron）里没有浏览器设置入口，提示文案改为系统设置。 */
function desktopShell(): boolean {
  const agent = typeof navigator === 'undefined' ? undefined : navigator.userAgent
  return typeof agent === 'string' && agent.includes('Electron')
}

/**
 * Translate a capture or transcription failure.
 * @param failure - the rejected value.
 * @param t - the active voice-input translator.
 * @returns localized failure text.
 */
export function failureText(failure: unknown, t: PropsLocale<typeof NS>['t']): string {
  if (failure instanceof RecordingError) {
    return failure.kind === 'permission' && desktopShell() ? t('permission.desktop') : t(failure.kind)
  }
  return t('failed', { message: failure instanceof Error ? failure.message : String(failure) })
}
