/** `yuanshu-account` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'yuanshu-account'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  /** Accessible name of the sidebar identity menu */
  'menu': '元枢账号',
  /** Settings entry inside the identity menu */
  'settings': '设置',
  /** Re-run the YuanShu sign-in page entry */
  'switchAccount': '切换元枢账号',
  /** Fallback label while the profile is unavailable */
  'accountFallback': '元枢账号',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<YuanShuAccountKey, string> = {
  'menu': 'YuanShu account',
  'settings': 'Settings',
  'switchAccount': 'Switch YuanShu account',
  'accountFallback': 'YuanShu account',
}

/** Key domain of the `yuanshu-account` namespace (zh is the source of truth). */
export type YuanShuAccountKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'yuanshu-account': YuanShuAccountKey
  }
}
