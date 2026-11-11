/** 侧栏底部的元枢身份入口：头像 + 展示名 + 账号菜单。 */
import { useEffect, useRef, useState } from 'react'
import { Menu, IconSettingsOutlineMedium, IconUserOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './YuanShuAccountLauncher.module.css'
import { avatarInitial, displayName, readCachedProfile, type YuanShuProfile } from './profile.ts'

/** 侧栏插件向界面提供的账号操作。 */
export interface YuanShuAccountInjected {
  /** 从同源网关读取当前账号；失败时返回 undefined，不阻断界面。 */
  readonly loadProfile: () => Promise<YuanShuProfile | undefined>
  /** 回到元枢登录页，用另一份账号重新登录。 */
  readonly switchAccount: () => void
}

/** 元枢身份入口组合在设置外壳的 single launcher 槽位里。 */
export type YuanShuAccountLauncherProps =
  PropsRuntime<'settings.launcher'> & PropsLocale<'yuanshu-account'> & InjectFace<YuanShuAccountInjected>

/** 单槽身份入口。
 * @param props - 侧栏几何、设置导航与元枢账号操作。
 * @returns 头像触发器和账号菜单。
 */
export function YuanShuAccountLauncher({
  wide, settingsShortcut, openSettings, loadProfile, switchAccount, t,
}: YuanShuAccountLauncherProps) {
  // 先用登录页缓存的资料渲染，网关返回后再以服务端资料覆盖。
  const [profile, setProfile] = useState<YuanShuProfile | undefined>(() => readCachedProfile())
  useEffect(() => {
    let alive = true
    void loadProfile()
      .then((next) => { if (alive && next !== undefined) setProfile(next) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [loadProfile])

  const name = displayName(profile)
  const label = name ?? t('accountFallback')
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  return <div className={css.root}>
    <Menu open={open} side="top" portal autoFocus className={css.anchor}
      anchor={<button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide}
        aria-label={t('menu')} aria-haspopup="menu" aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}>
        <span className={css.avatar} aria-hidden="true">{avatarInitial(name)}</span>
        {wide && <span className={css.label}>{label}</span>}
      </button>}
      items={[
        { id: 'settings', label: t('settings'), icon: <IconSettingsOutlineMedium size={16} />,
          ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
        { id: 'switch-account', label: t('switchAccount'), icon: <IconUserOutlineMedium size={16} /> },
      ]}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        setOpen(false)
        if (id === 'settings') { trigger.current?.focus(); openSettings() }
        else if (id === 'switch-account') switchAccount()
      }} />
  </div>
}
