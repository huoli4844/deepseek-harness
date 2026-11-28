/**
 * 工作台设置弹窗：左侧分类页签，右侧内容区。
 *
 * 只负责展示与回调，主题/字号由工作台外壳应用到自身子树；插件与技能数据由宿主
 * 通过 injected face 提供，缺少 Remote 服务时降级为不可用提示。
 * 弹窗经 Modal 挂到 document.body，收不到工作台根节点的主题令牌，
 * 因此按当前主题在弹窗根节点重新声明同一套令牌。
 */
import { useEffect, useRef, useState } from 'react'
import { Button, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillPackageEntry } from './skill-store-api.ts'
import css from './SettingsDialog.module.css'

export type WorkbenchTheme = 'dark' | 'light' | 'system'
/** 解析后的实际配色，用于弹窗与页面渲染。 */
export type WorkbenchResolvedTheme = 'dark' | 'light'
export type WorkbenchTextSize = 'small' | 'normal' | 'large'

export interface InstalledPluginEntry {
  readonly name: string
  readonly version?: string
  readonly enabled?: boolean
  /** 是否作为依赖安装在当前 profile 中；未启用但已安装的包仍会加载。 */
  readonly installed?: boolean
  /** 包来源：installation 表示随宿主体内置。 */
  readonly availability?: string
  readonly description?: string
}

export interface InstalledSkillEntry {
  readonly name: string
  readonly description: string
  /** false 表示该技能只能由用户手动调用，模型侧目录不会列出。 */
  readonly modelInvocable: boolean
  readonly path?: string
}

export interface WorkbenchSettingsSource {
  readonly loadPlugins: () => Promise<readonly InstalledPluginEntry[]>
  /** 读取当前会话的技能目录；没有可用会话或接口失败时返回空列表。 */
  readonly loadSkills: (sessionId?: string) => Promise<readonly InstalledSkillEntry[]>
  /** 读取元枢后台的技能包清单。 */
  readonly loadSkillPackages: () => Promise<readonly SkillPackageEntry[]>
  /** 下载技能包到浏览器本地。 */
  readonly downloadSkillPackage: (id: string, name: string) => Promise<void>
  /** 把技能包安装到本机技能目录。 */
  readonly installSkillPackage: (id: string) => Promise<string>
  /** 上传本地技能包到元枢后台。 */
  readonly uploadSkillPackage: (file: File) => Promise<string>
  /** 把本机已安装的技能直接打包上传。 */
  readonly uploadLocalSkill: (name: string) => Promise<string>
  /** 删除元枢平台上的技能包。 */
  readonly deleteSkillPackage: (id: string) => Promise<void>
}

interface SettingsDialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly t: PropsLocale<'yuanshu.workbench'>['t']
  readonly theme: WorkbenchTheme
  readonly onTheme: (value: WorkbenchTheme) => void
  /** 实际生效的配色：跟随系统时取宿主当前主题。 */
  readonly resolvedTheme: WorkbenchResolvedTheme
  readonly textSize: WorkbenchTextSize
  readonly onTextSize: (value: WorkbenchTextSize) => void
  readonly source?: WorkbenchSettingsSource | undefined
  /** 工作台助手会话；技能目录按会话读取。 */
  readonly sessionId?: string | undefined
}

const THEMES: readonly WorkbenchTheme[] = ['system', 'dark', 'light']
const THEME_LABELS: Record<WorkbenchTheme, 'settings.theme.system' | 'settings.theme.dark' | 'settings.theme.light'> = {
  system: 'settings.theme.system',
  dark: 'settings.theme.dark',
  light: 'settings.theme.light',
}
const SIZES: readonly WorkbenchTextSize[] = ['small', 'normal', 'large']
const PLUGINS_PER_PAGE = 8
type SettingsTab = 'appearance' | 'plugins' | 'skills' | 'skillPackages'
const TAB_ORDER: readonly SettingsTab[] = ['appearance', 'plugins', 'skills', 'skillPackages']

/**
 * 分页条：上一页、下一页、最多 10 个页码，并按每 10 页一组切换。
 * @param props - 当前页、总页数、翻页回调与文案函数。
 * @returns 分页条元素；调用方负责在只有一页时不渲染。
 */
function Pager({ page, total, onChange, t }: {
  readonly page: number
  readonly total: number
  readonly onChange: (page: number) => void
  readonly t: SettingsDialogProps['t']
}) {
  const groupStart = Math.floor(page / 10) * 10
  const numbers = Array.from(
    { length: Math.min(10, total - groupStart) },
    (_, offset) => groupStart + offset,
  )
  return (
    <div className={css.pager}>
      <button
        type="button"
        className={css.pagerButton}
        disabled={page === 0}
        aria-label={t('settings.pagePrev')}
        onClick={() => { onChange(page - 1) }}
      >{t('settings.pagePrev')}</button>
      {numbers.map(number => (
        <button
          key={number}
          type="button"
          className={number === page ? css.pagerActive : css.pagerButton}
          aria-current={number === page ? 'page' : undefined}
          onClick={() => { onChange(number) }}
        >{number + 1}</button>
      ))}
      <button
        type="button"
        className={css.pagerButton}
        disabled={page >= total - 1}
        aria-label={t('settings.pageNext')}
        onClick={() => { onChange(page + 1) }}
      >{t('settings.pageNext')}</button>
      <span className={css.pagerStatus}>
        {t('settings.pageOf', { page: page + 1, total })}
      </span>
    </div>
  )
}

/**
 * 元枢员工技能随工作台宿主分发，统一使用 yuanshu- 前缀；
 * 其余来自用户或项目技能目录的技能归为通用技能。
 * @param name - 技能目录中的名称。
 * @returns 是否为元枢平台技能。
 */
function isPlatformSkill(name: string): boolean {
  return name.startsWith('yuanshu-')
}

/**
 * Render the workbench settings dialog.
 * @param props - Open state, current values, change callbacks, and plugin source.
 * @returns the dialog element.
 */
export function SettingsDialog({
  open, onClose, t, theme, onTheme, resolvedTheme, textSize, onTextSize, source, sessionId,
}: SettingsDialogProps) {
  const [tab, setTab] = useState<SettingsTab>('appearance')
  const [plugins, setPlugins] = useState<readonly InstalledPluginEntry[]>()
  const [failed, setFailed] = useState(false)
  const [skills, setSkills] = useState<readonly InstalledSkillEntry[]>()
  const [skillsFailed, setSkillsFailed] = useState(false)
  const [packages, setPackages] = useState<readonly SkillPackageEntry[]>()
  const [packagesFailed, setPackagesFailed] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [noticeError, setNoticeError] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [pluginPage, setPluginPage] = useState(0)
  useEffect(() => {
    if (!open || source === undefined) return
    let alive = true
    setPlugins(undefined)
    setFailed(false)
    setSkills(undefined)
    setSkillsFailed(false)
    setPackages(undefined)
    setPackagesFailed(false)
    setBusy(undefined)
    setNotice(undefined)
    setNoticeError(false)
    setPluginPage(0)
    setTab('appearance')
    void source.loadPlugins()
      .then((list) => { if (alive) setPlugins(list) })
      .catch((error: unknown) => {
        console.error('[yuanshu-workbench] 读取已安装插件失败', error)
        if (alive) setFailed(true)
      })
    void source.loadSkills(sessionId)
      .then((list) => { if (alive) setSkills(list) })
      .catch((error: unknown) => {
        console.error('[yuanshu-workbench] 读取技能目录失败', error)
        if (alive) setSkillsFailed(true)
      })
    void source.loadSkillPackages()
      .then((list) => { if (alive) setPackages(list) })
      .catch((error: unknown) => {
        console.error('[yuanshu-workbench] 读取技能包清单失败', error)
        if (alive) setPackagesFailed(true)
      })
    return () => { alive = false }
  }, [open, source, sessionId])

  // 插件按卡片分页展示；只有超过一页时才渲染分页条。
  const pluginTotalPages = Math.max(1, Math.ceil((plugins?.length ?? 0) / PLUGINS_PER_PAGE))
  const pluginPageIndex = Math.min(pluginPage, pluginTotalPages - 1)
  const pluginStart = pluginPageIndex * PLUGINS_PER_PAGE
  const visiblePlugins = (plugins ?? []).slice(pluginStart, pluginStart + PLUGINS_PER_PAGE)
  const platformSkills = (skills ?? []).filter(skill => isPlatformSkill(skill.name))
  const generalSkills = (skills ?? []).filter(skill => !isPlatformSkill(skill.name))
  // 远端已有同名技能包时，视为已同步：上传按钮置灰并展示绿色标记。
  const syncedNames = new Set((packages ?? []).map(pkg => pkg.name))

  /**
   * 执行一次技能包操作：期间锁定按钮，结束后按需刷新清单并展示结果。
   * @param key - 忙碌标记，用于只禁用当前操作。
   * @param action - 实际操作，返回成功提示；返回 undefined 表示不需要提示。
   * @param reload - 是否在成功后重新读取清单。
   */
  const runPackageAction = async (
    key: string,
    action: (store: WorkbenchSettingsSource) => Promise<string | undefined>,
    reload = true,
  ): Promise<void> => {
    if (source === undefined) return
    setBusy(key)
    setNotice(undefined)
    setNoticeError(false)
    try {
      const message = await action(source)
      if (message !== undefined) setNotice(message)
      if (reload) {
        // 清单刷新失败不应覆盖本次操作的成败提示。
        try {
          setPackages(await source.loadSkillPackages())
        } catch (error) {
          console.error('[yuanshu-workbench] 刷新技能包清单失败', error)
        }
      }
    } catch (error) {
      console.error('[yuanshu-workbench] 技能包操作失败', error)
      const detail = error instanceof Error ? error.message.trim() : ''
      setNotice(detail === '' ? t('settings.skillPackageFailed') : detail)
      setNoticeError(true)
    } finally {
      setBusy(undefined)
    }
  }

  const downloadPackage = async (pkg: SkillPackageEntry): Promise<void> => {
    await runPackageAction(`download:${pkg.id}`, async (store) => {
      await store.downloadSkillPackage(pkg.id, pkg.name)
      return undefined
    }, false)
  }

  const installPackage = async (pkg: SkillPackageEntry): Promise<void> => {
    await runPackageAction(`install:${pkg.id}`, async (store) => {
      const name = await store.installSkillPackage(pkg.id)
      setSkills(await store.loadSkills(sessionId))
      return t('settings.skillPackageInstalled', { name: name === '' ? pkg.name : name })
    })
  }

  const deletePackage = async (pkg: SkillPackageEntry): Promise<void> => {
    if (!window.confirm(t('settings.skillPackageDeleteConfirm', { name: pkg.name }))) return
    await runPackageAction(`delete:${pkg.id}`, async (store) => {
      await store.deleteSkillPackage(pkg.id)
      return t('settings.skillPackageDeleted', { name: pkg.name })
    })
  }

  const uploadPackage = async (file: File): Promise<void> => {
    await runPackageAction('upload', async (store) => {
      const name = await store.uploadSkillPackage(file)
      return name === '' ? t('settings.skillPackageUploaded') : t('settings.skillPackageUploadedAs', { name })
    })
  }

  /** 本机技能一键上传：宿主负责把技能目录打包后转发给后台。 */
  const uploadSkill = async (skill: InstalledSkillEntry): Promise<void> => {
    await runPackageAction(`uploadSkill:${skill.name}`, async (store) => {
      const name = await store.uploadLocalSkill(skill.name)
      return t('settings.skillPackageUploadedAs', { name: name === '' ? skill.name : name })
    })
  }

  const renderSkills = (list: readonly InstalledSkillEntry[]) => (
    <ul className={css.pluginGrid}>
      {list.map(skill => (
        <Tooltip key={skill.name} label={skill.description} side="top" portal maxWidth={320} disabled={skill.description === ''}>
          <li className={css.pluginCard}>
            <code className={`${css.code} ${css.skillName}`}>/{skill.name}</code>
            {skill.modelInvocable ? null : (
              <span className={css.pluginOff}>{t('settings.skillUserOnly')}</span>
            )}
            {isPlatformSkill(skill.name) ? (
              <>
                {syncedNames.has(skill.name) ? (
                  <span className={css.synced}>{t('settings.skillSynced')}</span>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== undefined || syncedNames.has(skill.name)}
                  onClick={() => { void uploadSkill(skill) }}
                >{busy === `uploadSkill:${skill.name}` ? t('settings.skillPackageUploading') : t('settings.skillUpload')}</Button>
              </>
            ) : null}
          </li>
        </Tooltip>
      ))}
    </ul>
  )

  return (
    <Modal
      open={open}
      className={`${css.dialog ?? ''} ${(resolvedTheme === 'light' ? css.light : css.dark) ?? ''}`}
      title={t('settings.title')}
      closeLabel={t('settings.close')}
      footer={<Button onClick={onClose}>{t('settings.close')}</Button>}
      onClose={onClose}
    >
      <div className={css.layout}>
        <div className={css.tabs} role="tablist" aria-label={t('settings.title')}>
          {TAB_ORDER.map(value => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? css.tabActive : css.tab}
              onClick={() => { setTab(value) }}
            >{t(`settings.tab.${value}`)}</button>
          ))}
        </div>
        <div className={css.panel} role="tabpanel">
          {tab === 'appearance' ? (
            <>
              <section className={css.section}>
                <h3 className={css.sectionTitle}>{t('settings.theme')}</h3>
                <div className={css.options} role="group" aria-label={t('settings.theme')}>
                  {THEMES.map(value => (
                    <button
                      key={value}
                      type="button"
                      className={theme === value ? css.optionActive : css.option}
                      aria-pressed={theme === value}
                      onClick={() => { onTheme(value) }}
                    >{t(THEME_LABELS[value])}</button>
                  ))}
                </div>
              </section>
              <section className={css.section}>
                <h3 className={css.sectionTitle}>{t('settings.textSize')}</h3>
                <div className={css.options} role="group" aria-label={t('settings.textSize')}>
                  {SIZES.map(value => (
                    <button
                      key={value}
                      type="button"
                      className={textSize === value ? css.optionActive : css.option}
                      aria-pressed={textSize === value}
                      onClick={() => { onTextSize(value) }}
                    >{t(`settings.textSize.${value}`)}</button>
                  ))}
                </div>
              </section>
            </>
          ) : null}
          {tab === 'plugins' ? (
            <section className={css.section}>
              <h3 className={css.sectionTitle}>{t('settings.plugins')}</h3>
              {source === undefined ? (
                <p className={css.hint}>{t('settings.unavailable')}</p>
              ) : failed ? (
                <p className={css.hint}>{t('settings.pluginsFailed')}</p>
              ) : plugins === undefined ? (
                <p className={css.hint}>{t('settings.loading')}</p>
              ) : plugins.length === 0 ? (
                <p className={css.hint}>{t('settings.pluginsEmpty')}</p>
              ) : (
                <>
                  <ul className={css.pluginGrid}>
                    {visiblePlugins.map(plugin => (
                      <Tooltip
                        key={plugin.name}
                        label={plugin.description ?? ''}
                        side="top"
                        portal
                        maxWidth={320}
                        disabled={plugin.description === undefined || plugin.description === ''}
                      >
                        <li className={css.pluginCard}>
                          <span className={css.pluginName}>{plugin.name}</span>
                          {plugin.version === undefined ? null : (
                            <span className={css.pluginVersion}>{plugin.version}</span>
                          )}
                          <span className={plugin.enabled === false && plugin.installed !== true ? css.pluginOff : css.pluginOn}>
                            {t(plugin.enabled === false
                              ? (plugin.installed === true ? 'settings.installed' : 'settings.disabled')
                              : 'settings.enabled')}
                          </span>
                        </li>
                      </Tooltip>
                    ))}
                  </ul>
                  {pluginTotalPages > 1 && (
                    <Pager
                      page={pluginPageIndex}
                      total={pluginTotalPages}
                      onChange={setPluginPage}
                      t={t}
                    />
                  )}
                </>
              )}
            </section>
          ) : null}
          {tab === 'skills' ? (
            <section className={css.section}>
              <h3 className={css.sectionTitle}>{t('settings.skills')}</h3>
              {source === undefined ? (
                <p className={css.hint}>{t('settings.unavailable')}</p>
              ) : skillsFailed ? (
                <p className={css.hint}>{t('settings.skillsFailed')}</p>
              ) : skills === undefined ? (
                <p className={css.hint}>{t('settings.loading')}</p>
              ) : skills.length === 0 ? (
                // 技能目录按会话作用域加载：会话尚未建立时提示等待，就绪后随 sessionId 变化自动刷新。
                <p className={css.hint}>{sessionId === undefined ? t('settings.skillsWaiting') : t('settings.skillsEmpty')}</p>
              ) : (
                <>
                  {platformSkills.length === 0 ? null : (
                    <div className={css.skillGroup}>
                      <h4 className={css.skillGroupTitle}>{t('settings.skillsPlatform')}</h4>
                      {renderSkills(platformSkills)}
                    </div>
                  )}
                  {generalSkills.length === 0 ? null : (
                    <div className={css.skillGroup}>
                      <h4 className={css.skillGroupTitle}>{t('settings.skillsGeneral')}</h4>
                      {renderSkills(generalSkills)}
                    </div>
                  )}
                </>
              )}
              {notice === undefined ? null : <p className={noticeError ? css.noticeError : css.notice}>{notice}</p>}
            </section>
          ) : null}
          {tab === 'skillPackages' ? (
            <section className={css.section}>
              <div className={css.sectionHead}>
                <h3 className={css.sectionTitle}>{t('settings.skillPackages')}</h3>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== undefined || source === undefined}
                  onClick={() => { uploadRef.current?.click() }}
                >{busy === 'upload' ? t('settings.skillPackageUploading') : t('settings.skillPackageUpload')}</Button>
                <input
                  ref={uploadRef}
                  type="file"
                  accept=".zip,application/zip"
                  className={css.fileInput}
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file !== undefined) void uploadPackage(file)
                  }}
                />
              </div>
              <p className={css.hint}>{t('settings.skillPackagesHint')}</p>
              {source === undefined ? (
                <p className={css.hint}>{t('settings.unavailable')}</p>
              ) : packagesFailed ? (
                <p className={css.hint}>{t('settings.skillPackagesFailed')}</p>
              ) : packages === undefined ? (
                <p className={css.hint}>{t('settings.loading')}</p>
              ) : packages.length === 0 ? (
                <p className={css.hint}>{t('settings.skillPackagesEmpty')}</p>
              ) : (
                <ul className={css.packageList}>
                  {packages.map(pkg => (
                    <li key={pkg.id} className={css.packageCard}>
                      <div className={css.packageHead}>
                        <span className={css.pluginName}>{pkg.name}</span>
                        {pkg.version === undefined ? null : (
                          <span className={css.pluginVersion}>{t('settings.skillPackageVersion', { version: pkg.version })}</span>
                        )}
                        {pkg.status === undefined ? null : (
                          <span className={css.pluginOff}>{pkg.status}</span>
                        )}
                      </div>
                      {pkg.description === '' ? null : (
                        <p className={css.packageDesc}>{pkg.description}</p>
                      )}
                      <div className={css.packageActions}>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy !== undefined}
                          onClick={() => { void downloadPackage(pkg) }}
                        >{busy === `download:${pkg.id}` ? t('settings.skillPackageDownloading') : t('settings.skillPackageDownload')}</Button>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busy !== undefined}
                          onClick={() => { void installPackage(pkg) }}
                        >{busy === `install:${pkg.id}` ? t('settings.skillPackageInstalling') : t('settings.skillPackageInstall')}</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== undefined}
                          onClick={() => { void deletePackage(pkg) }}
                        >{busy === `delete:${pkg.id}` ? t('settings.skillPackageDeleting') : t('settings.skillPackageDelete')}</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {notice === undefined ? null : <p className={noticeError ? css.noticeError : css.notice}>{notice}</p>}
            </section>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
