/** Sidebar account launcher and locally authoritative sign-out action. */
import { useEffect, useRef, useState } from 'react'
import {
  Toast, Menu, IconEllipsisOutlineMedium, IconPaperPlaneOutlineRegular, IconSettingsOutlineRegular, IconUserOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountSectionInjected } from './AccountSection.tsx'
import { SignOutDialog } from './SignOutDialog.tsx'
import { SignInDialog } from './SignInDialog.tsx'
import { LogoutIcon } from './LogoutIcon.tsx'
import { AccountAvatar } from './AccountAvatar.tsx'
import type {} from './account-ui.ts'
import css from './AccountMenu.module.css'

/** Account launcher composed by the settings shell. */
export type AccountMenuProps = PropsRuntime<'settings.launcher'> & PropsLocale<'settings.account'> & InjectFace<AccountSectionInjected>

/** 外部身份接管时，登录入口应改用该平台自己的登录页。 */
function externalLoginEnabled(): boolean {
  const identity: unknown = Reflect.get(window, '__DSH_EXTERNAL_IDENTITY__')
  return typeof identity === 'object' && identity !== null && 'accountLauncher' in identity && identity.accountLauncher === true
}

function readYuanShuLabel(): string | undefined {
  const identity: unknown = Reflect.get(window, '__DSH_EXTERNAL_IDENTITY__')
  if (typeof identity !== 'object' || identity === null || !('accountLauncher' in identity) || identity.accountLauncher !== true) return undefined

  let profile: unknown
  try {
    profile = JSON.parse(localStorage.getItem('yuanshu-user') ?? 'null')
  } catch (_unreadableProfile) {
    // Browser storage can be unavailable or contain malformed JSON.
    return undefined
  }
  if (typeof profile !== 'object' || profile === null) return undefined
  for (const field of ['nickname', 'username']) {
    const value: unknown = Reflect.get(profile, field)
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

/** The signed-in label stays empty while the profile loads.
 * @param props - sidebar geometry, settings navigation and account operations.
 * @returns account menu launcher.
 */
export function AccountMenu({
  subscribeSessionExpired, subscribeModelSignInRequired, wide, settingsShortcut, openSettings, openOnboarding, settingsOpen,
  useAccount, useTheme, signOut, hasRunningAccountTasks, refreshAccount,
  contactUs, showLogin, start, cancel, avatarFailed, t,
}: AccountMenuProps) {
  // The launcher outlives the panel, so a false-to-true edge is one Settings entry:
  // re-renders, section switches and tab switches inside one open must not read again.
  const settingsWasOpen = useRef(false)
  useEffect(() => {
    if (settingsOpen && !settingsWasOpen.current) void refreshAccount()
    settingsWasOpen.current = settingsOpen
  }, [refreshAccount, settingsOpen])
  const account = useAccount(state => state)
  const colorScheme = useTheme(snapshot => snapshot.active.colorScheme)
  const signedIn = account.view?.status === 'credential-stored'
  const [signInNotice, setSignInNotice] = useState(0)
  useEffect(() => subscribeModelSignInRequired?.(() => { setSignInNotice(value => value + 1) }), [subscribeModelSignInRequired])
  const [expiryNotice, setExpiryNotice] = useState(false)
  useEffect(() => subscribeSessionExpired?.(() => { setExpiryNotice(true) }), [subscribeSessionExpired])
  const [yuanShuLabel] = useState(readYuanShuLabel)
  const hasIdentity = yuanShuLabel !== undefined || signedIn
  const profile = account.details?.profile
  const label = profile === undefined ? null : profile.status === 'ready'
    ? profile.value.name ?? profile.value.contact ?? t('signedIn') : t('signedIn')
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [yuanShuSignOutFailed, setYuanShuSignOutFailed] = useState(false)
  const signOutYuanShu = async () => {
    setBusy(true)
    setYuanShuSignOutFailed(false)
    try {
      const response = await fetch('/browser-sign-out', { method: 'POST' })
      if (!response.ok && response.status !== 401) {
        setYuanShuSignOutFailed(true)
        return
      }
      for (const key of ['yuanshu-login-token', 'yuanshu-token', 'workbench-client-token', 'yuanshu-user', 'yuanshu-active-tenant']) {
        localStorage.removeItem(key)
      }
      window.location.replace('/login')
    } catch (_signOutError) {
      setYuanShuSignOutFailed(true)
    } finally {
      setBusy(false)
    }
  }
  const [signOutImpact, setSignOutImpact] = useState<boolean | 'unknown'>()
  const requestSignOut = async () => {
    setBusy(true)
    try { setSignOutImpact(await hasRunningAccountTasks()); setOpen(false) }
    catch (_error) { setSignOutImpact('unknown'); setOpen(false) }
    finally { setBusy(false) }
  }
  // The plugin's start publishes `loginFailed` before it rejects, so the dialog owns the report.
  // 元枢等外部身份启用时，登录按钮直接进入平台登录页，不再走默认 DeepSeek 授权。
  const beginSignIn = (): void => {
    setOpen(false)
    if (externalLoginEnabled()) { window.location.replace('/login'); return }
    void start().catch(() => undefined)
  }
  return <div className={css.root} data-inset={hasIdentity && wide}>
    {signInNotice > 0 && <Toast key={signInNotice} text={t('modelSignInRequired')} onDone={() => { setSignInNotice(0) }} />}
    {yuanShuSignOutFailed && <Toast text={t('failed')} onDone={() => { setYuanShuSignOutFailed(false) }} />}
    {expiryNotice && <Toast text={t('sessionExpired')} onDone={() => { setExpiryNotice(false) }} />}
    <Menu open={open} side="top" portal autoFocus className={css.anchor} listClassName={hasIdentity ? undefined : css.signedOutMenu}
      anchor={<button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide} data-signed-out={!hasIdentity} aria-label={yuanShuLabel ?? t('menu')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        {yuanShuLabel !== undefined
          ? <span className={css.avatar} aria-hidden="true"><IconUserOutlineRegular size={14} /></span>
          : signedIn
            ? <span className={css.avatar} data-avatar-status={account.avatar?.status}>
              <AccountAvatar avatar={account.avatar} avatarFailed={avatarFailed} />
            </span>
            : <IconEllipsisOutlineMedium size={14} />}
        {wide && <span className={css.label}>{yuanShuLabel ?? (signedIn ? label : t('more'))}</span>}
      </button>}
      items={[
        { id: 'settings', label: t('settings'), icon: <IconSettingsOutlineRegular size={14} />,
          ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
        { id: 'contact', label: t('contactUs'), icon: <IconPaperPlaneOutlineRegular size={14} /> },
        ...(hasIdentity ? [{ id: 'signout', label: t('signOut'), icon: <LogoutIcon />, disabled: busy }]
          : [{ id: 'signin', label: t('signIn'), icon: <IconUserOutlineRegular size={14} /> }]),
      ]}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        if (id === 'settings') { setOpen(false); trigger.current?.focus(); openSettings() }
        else if (id === 'contact') { setOpen(false); contactUs() }
        else if (id === 'signin') beginSignIn()
        else if (yuanShuLabel !== undefined) void signOutYuanShu()
        else void requestSignOut()
      }} />
    {account.loginVisible && !account.onboarding && <SignInDialog account={account} colorScheme={colorScheme}
      start={start} cancel={cancel} t={t}
      close={() => { showLogin(false) }} useApiKey={() => { showLogin(false); openOnboarding('deepseek-official') }} />}
    {signedIn && signOutImpact !== undefined && <SignOutDialog running={signOutImpact} signOut={signOut}
      close={() => { setSignOutImpact(undefined) }} t={t} />}
  </div>
}
