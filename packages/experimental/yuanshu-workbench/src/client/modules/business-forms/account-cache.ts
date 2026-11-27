/** 只记住已验证的账号映射，供同一登录凭证断网时读取本机待办。 */
const prefix = 'dsh.yuanshu.report-account.v1.'

async function credentialKey(): Promise<string | undefined> {
  const tenant = localStorage.getItem('yuanshu-active-tenant')
  const token = localStorage.getItem('workbench-client-token')
  if (!tenant || !token) return
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const hex = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
    if (tenant === localStorage.getItem('yuanshu-active-tenant') && token === localStorage.getItem('workbench-client-token')) {
      return prefix + tenant + '.' + hex
    }
  } catch { /* 无可用密码模块时只使用在线验证。 */ }
}

/** 将服务端提供的人员和租户标识绑定到当前登录凭证。 */
export async function rememberReportAccount(account: string): Promise<void> {
  const key = await credentialKey()
  if (key) localStorage.setItem(key, account)
}

/** 只在原登录凭证仍在时恢复之前验证过的账号。 */
export async function cachedReportAccount(): Promise<string | undefined> {
  const key = await credentialKey()
  const account = key ? localStorage.getItem(key) : null
  return account && /^\d+:\d+$/u.test(account) ? account : undefined
}
