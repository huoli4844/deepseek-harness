import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { YuanShuAccountLauncher, type YuanShuAccountInjected } from './YuanShuAccountLauncher.tsx'
import { NS, en, zh } from './locales.ts'
import { fetchCurrentUser } from './profile.ts'

export const inject = ['slots', 'locale']

/** 外部身份提供方（yuanshu-login-server）注入的页面全局。 */
const EXTERNAL_IDENTITY_GLOBAL = '__DSH_EXTERNAL_IDENTITY__'

/** 只有确认元枢接管身份入口时才占用 single launcher，避免与账号插件争槽位。 */
function externalIdentityOwnsLauncher(): boolean {
  const value = (globalThis as Record<string, unknown>)[EXTERNAL_IDENTITY_GLOBAL]
  return typeof value === 'object' && value !== null
    && (value as { accountLauncher?: unknown }).accountLauncher === true
}

/** 元枢账号操作在所有座位间共享同一实现。 */
const operations: YuanShuAccountInjected = {
  loadProfile: () => fetchCurrentUser(),
  switchAccount: () => {
    globalThis.location.assign('/login')
  },
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'yuanshu-account: dictionaries')

  // 元枢是唯一身份：外部身份插件（yuanshu-login-server 注入的页面全局）
  // 已让 DeepSeek 账号插件让出这个 single launcher 槽位。
  if (!externalIdentityOwnsLauncher()) return
  ctx.slots.inject('settings.launcher', () => ctx.slots.register({
    name: 'settings.launcher',
    locale: NS,
    inject: (): YuanShuAccountInjected => operations,
  }, YuanShuAccountLauncher))
}
