/**
 * 工作台设置弹窗：主题、文字大小、插件仓库、已安装插件与当前会话技能。
 *
 * 只负责展示与回调，主题/字号由工作台外壳应用到自身子树；插件数据由宿主
 * 通过 injected face 提供，缺少 Remote 服务时降级为不可用提示。
 * 弹窗经 Modal 挂到 document.body，收不到工作台根节点的主题令牌，
 * 因此按当前主题在弹窗根节点重新声明同一套令牌。
 */
import { useEffect, useState } from 'react'
import { Button, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
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
  readonly repositories: readonly string[]
  readonly loadPlugins: () => Promise<readonly InstalledPluginEntry[]>
  /** 读取当前会话的技能目录；没有可用会话或接口失败时返回空列表。 */
  readonly loadSkills: (sessionId?: string) => Promise<readonly InstalledSkillEntry[]>
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
const SKILLS_PER_PAGE = 8
const PLUGINS_PER_PAGE = 8

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
 * Render the workbench settings dialog.
 * @param props - Open state, current values, change callbacks, and plugin source.
 * @returns the dialog element.
 */
export function SettingsDialog({
  open, onClose, t, theme, onTheme, resolvedTheme, textSize, onTextSize, source, sessionId,
}: SettingsDialogProps) {
  const [plugins, setPlugins] = useState<readonly InstalledPluginEntry[]>()
  const [failed, setFailed] = useState(false)
  const [skills, setSkills] = useState<readonly InstalledSkillEntry[]>()
  const [skillsFailed, setSkillsFailed] = useState(false)
  const [skillPage, setSkillPage] = useState(0)
  const [pluginPage, setPluginPage] = useState(0)
  useEffect(() => {
    if (!open || source === undefined) return
    let alive = true
    setPlugins(undefined)
    setFailed(false)
    setSkills(undefined)
    setSkillsFailed(false)
    setSkillPage(0)
    setPluginPage(0)
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
    return () => { alive = false }
  }, [open, source, sessionId])

  // 插件与技能都按卡片分页展示；只有超过一页时才渲染分页条。
  const pluginTotalPages = Math.max(1, Math.ceil((plugins?.length ?? 0) / PLUGINS_PER_PAGE))
  const pluginPageIndex = Math.min(pluginPage, pluginTotalPages - 1)
  const pluginStart = pluginPageIndex * PLUGINS_PER_PAGE
  const visiblePlugins = (plugins ?? []).slice(pluginStart, pluginStart + PLUGINS_PER_PAGE)

  const skillTotalPages = Math.max(1, Math.ceil((skills?.length ?? 0) / SKILLS_PER_PAGE))
  const skillPageIndex = Math.min(skillPage, skillTotalPages - 1)
  const skillStart = skillPageIndex * SKILLS_PER_PAGE
  const visibleSkills = (skills ?? []).slice(skillStart, skillStart + SKILLS_PER_PAGE)

  return (
    <Modal
      open={open}
      className={`${css.dialog ?? ''} ${(resolvedTheme === 'light' ? css.light : css.dark) ?? ''}`}
      contentClassName={css.content ?? ''}
      title={t('settings.title')}
      closeLabel={t('settings.close')}
      footer={<Button onClick={onClose}>{t('settings.close')}</Button>}
      onClose={onClose}
    >
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
      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.repositories')}</h3>
        {source === undefined ? (
          <p className={css.hint}>{t('settings.unavailable')}</p>
        ) : (
          <ul className={css.list}>
            {source.repositories.map(url => (
              <li key={url} className={css.listRow}>
                <code className={css.code}>{url}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
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
      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.skills')}</h3>
        {source === undefined ? (
          <p className={css.hint}>{t('settings.unavailable')}</p>
        ) : skillsFailed ? (
          <p className={css.hint}>{t('settings.skillsFailed')}</p>
        ) : skills === undefined ? (
          <p className={css.hint}>{t('settings.loading')}</p>
        ) : skills.length === 0 ? (
          <p className={css.hint}>{t('settings.skillsEmpty')}</p>
        ) : (
          <>
            <ul className={css.pluginGrid}>
              {visibleSkills.map(skill => (
                <Tooltip key={skill.name} label={skill.description} side="top" portal maxWidth={320} disabled={skill.description === ''}>
                  <li className={css.pluginCard}>
                    <code className={`${css.code} ${css.skillName}`}>/{skill.name}</code>
                    {skill.modelInvocable ? null : (
                      <span className={css.pluginOff}>{t('settings.skillUserOnly')}</span>
                    )}
                  </li>
                </Tooltip>
              ))}
            </ul>
            {skillTotalPages > 1 && (
              <Pager
                page={skillPageIndex}
                total={skillTotalPages}
                onChange={setSkillPage}
                t={t}
              />
            )}
          </>
        )}
      </section>
    </Modal>
  )
}
