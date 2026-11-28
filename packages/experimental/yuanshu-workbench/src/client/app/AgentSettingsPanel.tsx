/** 展示当前宿主注册的智能体清单；只读取 preset 状态，不管理安装或会话。 */
import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AgentSettingsPanel.module.css'

/** 本地 Agent preset 的用户可见信息。 */
export interface InstalledAgentEntry {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly isDefault: boolean
  readonly broken?: string
}

/** 读取当前宿主中已注册的智能体。 */
export interface AgentSettingsSource {
  readonly loadAgents: () => Promise<readonly InstalledAgentEntry[]>
}

/** 设置页中的智能体清单与可用状态。 */
export function AgentSettingsPanel({ source, t }: {
  readonly source: AgentSettingsSource | undefined
  readonly t: PropsLocale<'yuanshu.workbench'>['t']
}) {
  const [agents, setAgents] = useState<readonly InstalledAgentEntry[]>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (source === undefined) return
    let active = true
    void source.loadAgents().then(
      (rows) => { if (active) setAgents(rows) },
      (error: unknown) => {
        console.error('[yuanshu-workbench] 读取本机智能体失败', error)
        if (active) setFailed(true)
      },
    )
    return () => { active = false }
  }, [source])

  return <section className={css.section}>
    <h3 className={css.title}>{t('settings.agents')}</h3>
    <p className={css.hint}>{t('settings.agentsHint')}</p>
    {source === undefined ? <p className={css.hint}>{t('settings.unavailable')}</p>
      : failed ? <p className={css.hint}>{t('settings.agentsFailed')}</p>
        : agents === undefined ? <p className={css.hint}>{t('settings.loading')}</p>
          : agents.length === 0 ? <p className={css.hint}>{t('settings.agentsEmpty')}</p>
            : <ul className={css.list}>{agents.map(agent => <li key={agent.id}>
              <article className={css.card}>
                <div className={css.cardHead}>
                  <strong className={css.name}>{agent.name?.trim() || agent.id}</strong>
                  {agent.isDefault ? <span className={css.badge}>{t('settings.agentDefault')}</span> : null}
                  <span className={agent.broken === undefined ? css.badge : css.broken}>
                    {t(agent.broken === undefined ? 'settings.agentReady' : 'settings.agentUnavailable')}
                  </span>
                </div>
                <p className={css.description}>{agent.description || t('settings.agentNoDescription')}</p>
                <p className={css.description}>{t('settings.agentId')}: <code className={css.id}>{agent.id}</code></p>
                {agent.broken === undefined ? null : <p className={css.description}>{t('settings.agentUnavailableHint')}</p>}
              </article>
            </li>)}</ul>}
  </section>
}
