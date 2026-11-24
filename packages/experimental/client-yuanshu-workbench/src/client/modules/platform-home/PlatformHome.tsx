/** The authenticated employee's live risk and task projection. */
import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import css from '../../app/Workbench.module.css'

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
type State =
  | { kind: 'loading' }
  | { kind: 'login' }
  | { kind: 'connecting' }
  | { kind: 'denied' }
  | { kind: 'failure'; status?: number; upstream?: number; detail?: string }
  | { kind: 'consent'; url: string }
  | { kind: 'ready'; home: Home }

/** Keys a failure state can map its status codes onto. */
type FailureKey =
  | 'live.login' | 'live.denied' | 'live.busy' | 'live.connecting'
  | 'live.ratelimited' | 'live.serverError' | 'live.network' | 'live.failure'

/**
 * Explain a failed load by its status codes: the local route status first,
 * with YuanShu's own backend status (e.g. 429 rate limiting) taking priority
 * when it is the actual cause.
 */
function messageKeyFor(state: { status?: number; upstream?: number }): FailureKey {
  if (state.status === undefined) return 'live.network'
  if (state.status === 429 || state.upstream === 429) return 'live.ratelimited'
  if (state.status === 401) return 'live.login'
  if (state.status === 403) return 'live.denied'
  if (state.status === 409) return 'live.busy'
  if (state.status === 424) return 'live.connecting'
  if (state.status >= 500) return 'live.serverError'
  return 'live.failure'
}

/**
 * Render the Host-owned employee projection while this panel is open.
 * @param props - Localized workbench labels.
 * @returns The live work queue and its request status.
 */
export function PlatformHome({ t, onAnalyze, section }: PropsLocale<'yuanshu.workbench'> & {
  readonly section: string
  readonly onAnalyze: (prompt: string, sessionKey: string) => void
}) {
  const [selected, setSelected] = useState<Item>()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // While the explicit-consent window is open or the connection is still
  // being established, re-run the load cycle periodically: once the browser
  // consent lands the next GET returns ready.
  useEffect(() => {
    if (state.kind !== 'consent' && state.kind !== 'connecting') return
    const timer = setInterval(() => { setAttempt(value => value + 1) }, 3000)
    return () => { clearInterval(timer) }
  }, [state.kind])
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const aborted = () => signal.aborted
    void (async () => {
      try {
        const token = localStorage.getItem('workbench-client-token')
        if (!token) {
          setState({ kind: 'login' })
          return
        }
        const headers = { authorization: `Bearer ${token}`, 'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '' }
        const load = () => fetch(`/yuanshu-workbench/home?section=${encodeURIComponent(section)}`, { headers, signal })
        let response = await load()
        if (response.status === 424 && !aborted()) {
          const grant = await fetch('/yuanshu-workbench/home', { method: 'POST', headers, signal })
          if (aborted()) return
          const grantBody = await grant.json().catch(() => undefined) as { authorizationUrl?: string; upstream?: number; detail?: string } | undefined
          if (grant.status === 401) {
            setState({ kind: 'login' })
            return
          }
          if (grant.status === 403) {
            const url = typeof grantBody?.authorizationUrl === 'string' && grantBody.authorizationUrl !== '' ? grantBody.authorizationUrl : undefined
            setState(url === undefined ? { kind: 'denied' } : { kind: 'consent', url })
            return
          }
          if (grant.status === 409) {
            // Another authorization attempt is already running: poll until it settles.
            setState({ kind: 'connecting' })
            return
          }
          if (!grant.ok) {
            setState({
              kind: 'failure',
              status: grant.status,
              ...(typeof grantBody?.upstream === 'number' ? { upstream: grantBody.upstream } : {}),
              ...(typeof grantBody?.detail === 'string' && grantBody.detail !== '' ? { detail: grantBody.detail } : {}),
            })
            return
          }
          response = await load()
        }
        if (aborted()) return
        if (response.status === 401) {
          setState({ kind: 'login' })
          return
        }
        if (response.status === 424) {
          setState({ kind: 'connecting' })
          return
        }
        if (!response.ok) {
          const body = await response.json().catch(() => undefined) as { upstream?: number; detail?: string } | undefined
          if (aborted()) return
          setState({
            kind: 'failure',
            status: response.status,
            ...(typeof body?.upstream === 'number' ? { upstream: body.upstream } : {}),
            ...(typeof body?.detail === 'string' && body.detail !== '' ? { detail: body.detail } : {}),
          })
          return
        }
        const home = await response.json() as Home
        if (!aborted()) setState({ kind: 'ready', home })
      } catch (_loadFailed) {
        if (!aborted()) setState({ kind: 'failure' })
      }
    })()
    return () => { controller.abort() }
  }, [attempt, section])

  return <section className={css.card}>
    {state.kind === 'loading' && <p role="status">{t('live.loading')}</p>}
    {state.kind === 'login' && <p role="alert">{t('live.login')}</p>}
    {state.kind === 'connecting' && <>
      <p role="status">{t('live.connecting')}</p>
      <Button onClick={() => { setState({ kind: 'loading' }); setAttempt(value => value + 1) }}>{t('live.retry')}</Button>
    </>}
    {state.kind === 'consent' && <>
      <p role="alert">{t('live.consent')}</p>
      <Button onClick={() => { window.open(state.url, '_blank', 'noopener') }}>{t('live.consentOpen')}</Button>
      <Button onClick={() => { setState({ kind: 'loading' }); setAttempt(value => value + 1) }}>{t('live.retry')}</Button>
    </>}
    {(state.kind === 'failure' || state.kind === 'denied') && <>
      <p role="alert">{t(state.kind === 'denied' ? 'live.denied' : messageKeyFor(state))}</p>
      {state.kind === 'failure' && (state.status !== undefined || state.upstream !== undefined || state.detail !== undefined) && <p className={css.statusMeta}>
        {[
          state.status !== undefined ? `${t('live.errorCode')} ${state.status}` : undefined,
          state.upstream !== undefined ? `${t('live.upstreamCode')} ${state.upstream}` : undefined,
          state.detail !== undefined ? state.detail.slice(0, 160) : undefined,
        ].filter(Boolean).join(' · ')}
      </p>}
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
