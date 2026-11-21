/** The authenticated employee's live risk and task projection. */
import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './Workbench.module.css'

type Item = {
  readonly kind: 'risk' | 'task'
  readonly id: number
  readonly title: string
  readonly code?: string
  readonly project?: string
  readonly owner?: string
  readonly deadline?: string
  readonly status?: string
}
type Home = {
  readonly name: string
  readonly employee: { tenantId: string; userId: number }
  readonly rows: readonly { title: string; detail: string }[]
  readonly items: readonly Item[]
}
type State = { kind: 'loading' | 'login' | 'failure' | 'denied' } | { kind: 'ready'; home: Home }

/**
 * Render the Host-owned employee projection while this panel is open.
 * @param props - Localized workbench labels.
 * @returns The live work queue and its request status.
 */
export function PlatformHome({ t, onAnalyze, section, title }: PropsLocale<'yuanshu.workbench'> & {
  readonly section: string
  readonly title: string
  readonly onAnalyze: (prompt: string, sessionKey: string) => void
}) {
  const [selected, setSelected] = useState<Item>()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const aborted = () => signal.aborted
    const report = (kind: 'login' | 'failure' | 'denied'): void => { setState({ kind }) }
    void (async () => {
      try {
        const token = localStorage.getItem('workbench-client-token')
        if (!token) {
          report('login')
          return
        }
        const headers = { authorization: `Bearer ${token}`, 'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '' }
        const load = () => fetch(`/yuanshu-workbench/home?section=${encodeURIComponent(section)}`, { headers, signal })
        let response = await load()
        if (response.status === 424 && !aborted()) {
          const grant = await fetch('/yuanshu-workbench/home', { method: 'POST', headers, signal })
          if (aborted()) return
          if (grant.status === 401) {
            report('login')
            return
          }
          if (grant.status === 403) {
            report('denied')
            return
          }
          if (!grant.ok) {
            report('failure')
            return
          }
          response = await load()
        }
        if (aborted()) return
        if (response.status === 401) {
          report('login')
          return
        }
        if (!response.ok) {
          report('failure')
          return
        }
        const home = await response.json() as Home
        if (!aborted()) setState({ kind: 'ready', home })
      } catch (_loadFailed) {
        if (!aborted()) report('failure')
      }
    })()
    return () => { controller.abort() }
  }, [attempt, section])

  return <section className={css.card}>
    <h1>{title}</h1>
    {state.kind === 'loading' && <p role="status">{t('live.loading')}</p>}
    {state.kind === 'login' && <p role="alert">{t('live.login')}</p>}
    {(state.kind === 'failure' || state.kind === 'denied') && <>
      <p role="alert">{t(state.kind === 'denied' ? 'live.denied' : 'live.failure')}</p>
      <Button onClick={() => { setState({ kind: 'loading' }); setAttempt(value => value + 1) }}>{t('live.retry')}</Button>
    </>}
    {state.kind === 'ready' && <>
      <p>{state.home.name}</p>
      {state.home.items.length === 0 && state.home.rows.length === 0 ? <p>{t('live.emptySection')}</p> : <ul>
        {state.home.items.map(item => <li key={`${item.kind}:${item.id}`}>
          <Button onClick={() => { setSelected(item) }}>{t(item.kind === 'risk' ? 'live.risk' : 'live.task')} · {item.title}</Button>
        </li>)}
      </ul>}
      {state.home.rows.length > 0 && <ul>
        {state.home.rows.map((row, index) => <li key={index}>
          <strong>{row.title}</strong>{row.detail && <p>{row.detail}</p>}
        </li>)}
      </ul>}
      {selected && <section>
        <h2>{selected.title}</h2>
        <dl>
          {(['code', 'project', 'owner', 'deadline', 'status'] as const).map(field => selected[field] &&
            <div key={field}><dt>{t(`live.${field}`)}</dt><dd>{selected[field]}</dd></div>)}
        </dl>
        <Button onClick={() => {
          const { employee } = state.home
          onAnalyze(`${t('live.analysisPrompt')}\n${JSON.stringify(selected)}`,
            `item:${employee.tenantId}:${employee.userId}:${selected.kind}:${selected.id}`)
        }}>{t('live.analyze')}</Button>
      </section>}
    </>}
  </section>
}
