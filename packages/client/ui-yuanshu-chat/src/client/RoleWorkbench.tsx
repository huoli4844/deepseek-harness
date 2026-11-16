/** Employee workbench; the platform supplies the current role, priorities and records. */
import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import { EnterpriseWorkbench, type EnterpriseWorkbenchInjected } from './EnterpriseWorkbench.tsx'
import { qaStorageIdentity, readActiveTenant, writeActiveTenant } from './storage.ts'
import css from './RoleWorkbench.module.css'

type Props = InjectFace<EnterpriseWorkbenchInjected> & PropsLocale<typeof NS> & Pick<PropsRuntime<'main'>, 'useResource'>
type Row = Record<string, unknown>
function object(value: unknown): Row | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined
}
function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.flatMap((item): Row[] => { const row = object(item); return row === undefined ? [] : [row] }) : []
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}
function business(value: unknown): Row | undefined {
  const envelope = object(object(value)?.structuredContent ?? value)
  return object(envelope?.data) ?? envelope
}
function resource(path: string, generation: number, tool?: string, args: Row = {}): string {
  const query = new URLSearchParams({ owner: qaStorageIdentity() ?? 'unauthorized', generation: String(generation) })
  if (tool !== undefined) { query.set('tool', tool); query.set('args', JSON.stringify(args)) }
  return `dsh-resource://yuanshu-enterprise/${path}?${query}`
}

/** Render the signed-in user's platform-projected work before exposing optional diagnostics. */
export function RoleWorkbench(props: Props): React.JSX.Element {
  const { useResource, t } = props
  const [generation, setGeneration] = useState(0)
  const [diagnostics, setDiagnostics] = useState(false)
  const [selection, setSelection] = useState<{ domain: string; title: string; keyword?: string; id?: string }>()
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string>()
  const [authorizing, setAuthorizing] = useState(false)
  const [authorizationFailed, setAuthorizationFailed] = useState(false)
  const identity = useResource<'yuanshu-enterprise'>(resource('identity', generation))
  const catalog = useResource<'yuanshu-enterprise'>(resource('catalog', generation))
  const description = catalog.status === 'live' && catalog.value?.kind === 'catalog' ? catalog.value : undefined
  const tenants = identity.value?.kind === 'identity' ? identity.value.tenants : []
  const readAddress = (name: string, args: Row = {}) => description?.tools.some(tool => tool.name === name)
    ? resource('business', generation, name, args) : ''
  const profile = useResource<'yuanshu-enterprise'>(readAddress('workbench_profile'))
  const position = useResource<'yuanshu-enterprise'>(readAddress('workbench_position'))
  const briefing = useResource<'yuanshu-enterprise'>(readAddress('workbench_briefing'))
  const decisions = useResource<'yuanshu-enterprise'>(readAddress('workbench_decisions'))
  const home = useResource<'yuanshu-enterprise'>(readAddress('workbench_home'))
  const navigator = useResource<'yuanshu-enterprise'>(readAddress('workbench_navigator'))
  const records = useResource<'yuanshu-enterprise'>(selection === undefined ? '' : readAddress('workbench_records', {
    domain: selection.domain, page, page_size: 20, ...(selection.keyword === undefined ? {} : { keyword: selection.keyword }),
  }))
  const p = profile.value?.kind === 'result' ? business(profile.value.result) : undefined
  const pack = position.value?.kind === 'result' ? business(position.value.result) : undefined
  const brief = briefing.value?.kind === 'result' ? business(briefing.value.result) : undefined
  const queue = decisions.value?.kind === 'result' ? business(decisions.value.result) : undefined
  const overview = home.value?.kind === 'result' ? business(home.value.result) : undefined
  const nav = navigator.value?.kind === 'result' ? business(navigator.value.result) : undefined
  const result = records.value?.kind === 'result' ? business(records.value.result) : undefined
  const items = rows(result?.items)
  const active = items.find(row => text(row.id) === (selectedId ?? selection?.id)) ?? items[0]
  const refresh = () => { setGeneration(value => value + 1) }
  const open = (domain: string, title: string, keyword?: string, id?: string) => {
    setSelection({ domain, title, ...(keyword ? { keyword } : {}), ...(id ? { id } : {}) })
    setPage(1); setSelectedId(undefined)
  }
  const unavailable = (status: string, empty: string) => <p className={css.empty} role={status === 'failed' ? 'alert' : undefined}>
    {status === 'failed' ? t('requestFailed') : status === 'loading' ? t('recordsLoading') : empty}</p>
  const summaryItems = (entries: Row[], status: string, empty: string) => entries.length === 0
    ? unavailable(status, empty)
    : <ul className={css.list}>{entries.map(item => <li key={text(item.id)}>
      <div className={css.itemHead}><span>{text(item.title)}</span>{item.overdue === true && <span className={css.warning}>{t('overdue')}</span>}</div>
      {(text(item.meta) || text(item.reason)) && <p>{text(item.meta) || text(item.reason)}</p>}
      {text(item.recommendation) && <p>{t('cockpitRecommend')}：{text(item.recommendation)}</p>}
      {rows(item.evidence).length > 0 && <dl className={css.facts}>
        {rows(item.evidence).map(evidence => <div key={text(evidence.label)}>
          <dt>{text(evidence.label)}</dt><dd>{text(evidence.value)}</dd></div>)}</dl>}
      {text(item.domain) && description?.tools.some(tool => tool.name === 'workbench_records') && <button type="button" className={css.textButton}
        onClick={() => { open(text(item.domain), text(item.title), text(item.record_code), text(item.record_id)) }}>{t('cockpitView')}</button>}
    </li>)}</ul>
  const authorizationRequired = catalog.failure?.code === 'yuanshu/authorization-required'
  if (diagnostics) return <div className={css.root}><button type="button" className={css.textButton} onClick={() => { setDiagnostics(false) }}>{t('returnToWork')}</button><EnterpriseWorkbench {...props} /></div>
  return <div className={css.root}>
    <header className={css.topbar}>
      <span className={css.brand}>{t('workbenchTitle')}</span>
      <div className={css.controls}>
        <select aria-label={t('activeTenant')} value={readActiveTenant() ?? ''} onChange={(event) => {
          writeActiveTenant(event.target.value); setSelection(undefined); setSelectedId(undefined); setAuthorizationFailed(false); refresh()
        }}><option value="">{t('selectTenant')}</option>{tenants.map(tenant => <option key={tenant.code} value={String(tenant.id ?? tenant.code)}>{tenant.name ?? tenant.code}</option>)}</select>
        <button type="button" onClick={refresh}>{t('refresh')}</button>
      </div>
    </header>
    <div className={css.scroll}>
      {catalog.status === 'loading' && <div className={css.loading} role="status">{t('homeLoading')}</div>}
      {(catalog.status === 'failed' || authorizationFailed) && <section className={css.notice} role="alert">
        <h2>{t(authorizationRequired ? 'connectWorkTitle' : 'homeFailed')}</h2>
        <p>{t(authorizationRequired ? 'connectWorkDescription' : catalog.failure?.code === 'yuanshu/permission-denied' ? 'enterprisePermissionDenied' : 'requestFailed')}</p>
        {authorizationRequired && <button type="button" disabled={authorizing || !readActiveTenant()} onClick={() => {
          setAuthorizing(true); setAuthorizationFailed(false)
          void props.authorize().then(refresh).catch(() => { setAuthorizationFailed(true) }).finally(() => { setAuthorizing(false) })
        }}>{t(authorizing ? 'running' : 'connectWork')}</button>}
      </section>}
      {description !== undefined && <>
        <section className={css.intro}>
          <div><p className={css.eyebrow}>{description.page.application.name} · {text(p?.nickname) || text(p?.username) || t('account')}</p>
            <h1>{text(pack?.title) || text(object(overview?.workbench)?.name) || t('workbenchSubtitle')}</h1>
            <p className={css.headline}>{text(pack?.headline) || t('cockpitQuestion')}</p>
          </div>
          <div className={css.context}>
            <span>{text(object(overview?.data_scope)?.description) || text(object(pack?.scope)?.description)}</span>
            {rows(p?.active_roles).map(role => <span key={text(role.code)}>{text(role.name)}</span>)}</div>
        </section>
        {nav !== undefined && <nav className={css.navigation} aria-label={t('businessNavigation')}>
          <button type="button" aria-current={selection === undefined ? 'page' : undefined} onClick={() => { setSelection(undefined) }}>{t('navHome')}</button>
          {rows(nav.groups).map(group => <details key={text(group.code)} className={css.navGroup}><summary>{text(group.title)}</summary>
            <div>{rows(group.items).map(item => <button type="button" key={text(item.code)} aria-current={selection?.domain === item.code ? 'page' : undefined}
              onClick={() => { open(text(item.code), text(item.title)) }}>
              {text(item.title)} <span>{text(item.count)}</span></button>)}</div>
          </details>)}
        </nav>}
        {selection === undefined ? <>
          {briefing.status === 'failed' && unavailable('failed', '')}
          {briefing.status === 'loading' && unavailable('loading', '')}
          {brief !== undefined && rows(brief.kpis).length > 0 && <div className={css.metrics}>
            {rows(brief.kpis).map(metric => <section key={text(metric.key)} className={css.metric}>
              <span>{text(metric.label)}</span><strong data-tone={text(metric.tone)}>{text(metric.value)}</strong></section>)}</div>}
          <div className={css.columns}>
            <section className={css.panel}><h2>{t('cockpitDecisions')}</h2>{summaryItems(rows(queue?.items), decisions.status, t('cockpitNoDecision'))}</section>
            <div className={css.side}>
              <section className={css.panel}><h2>{t('cockpitToday')}</h2>{summaryItems(rows(brief?.today), briefing.status, t('noUpcomingWork'))}</section>
              <section className={css.panel}><h2>{t('cockpitExceptions')}</h2>{summaryItems(rows(brief?.exceptions), briefing.status, t('noExceptions'))}</section>
            </div>
          </div>
          {rows(overview?.projects).length > 0 && <section className={css.panel}><h2>{t('projectProgress')}</h2>
            <div className={css.projectGrid}>{rows(overview?.projects).map(project =>
              <article key={text(project.id)} className={css.project}>
                <p className={css.eyebrow}>{text(project.code)}</p><h3>{text(project.name)}</h3>
                <p>{t('progressLabel')} {text(project.progress_percent)}% · {t('openTasksCount')} {text(project.open_tasks)} · {t('openRisksCount')} {text(project.open_risks)}</p>
                <button type="button" className={css.textButton} onClick={() => { open('projects', text(project.name), text(project.code), text(project.id)) }}>{t('cockpitView')}</button>
              </article>)}</div></section>}
          {rows(overview?.scenes).some(scene => scene.available === false) && <section className={css.panel}><h2>{t('unavailableWorkflows')}</h2>
            <ul className={css.list}>{rows(overview?.scenes).filter(scene => scene.available === false).map(scene =>
              <li key={text(scene.code)}><span>{text(scene.title)}</span><p>{text(scene.description)}</p></li>)}</ul></section>}
          {home.status === 'failed' && unavailable('failed', '')}
        </> : <section className={css.panel}>
          <div className={css.sectionHead}><h2>{selection.title}</h2><button type="button" onClick={() => { setSelection(undefined) }}>{t('returnToWork')}</button></div>
          {records.status === 'loading' || records.status === 'failed' ? unavailable(records.status, '') : items.length === 0 ? unavailable('live', t('sectionEmpty')) : <div className={css.recordLayout}>
            <div><div className={css.tableWrap}><table className={css.table}><thead><tr><th>{t('recordsName')}</th><th>{t('recordsOwner')}</th><th>{t('deadline')}</th></tr></thead><tbody>
              {items.map(row => <tr key={text(row.id)} aria-selected={row === active}><td><button type="button" className={css.recordButton} onClick={() => { setSelectedId(text(row.id)) }}>{text(row.title) || text(row.code)}</button><p>{text(row.code)}</p></td><td>{text(row.owner_name) || t('unassigned')}</td><td><span className={row.overdue === true ? css.warning : undefined}>{text(row.due_date) || '—'}</span></td></tr>)}
            </tbody></table></div>
            <div className={css.pagination}><button type="button" disabled={page === 1} onClick={() => { setPage(value => value - 1); setSelectedId(undefined) }}>{t('previousPage')}</button><span>{t('recordsTotal', { count: text(result?.total) })}</span><button type="button" disabled={typeof result?.total !== 'number' || page * 20 >= result.total} onClick={() => { setPage(value => value + 1); setSelectedId(undefined) }}>{t('nextPage')}</button></div></div>
            {active !== undefined && <aside className={css.detail}>
              <h3>{text(active.title) || text(active.code)}</h3><dl className={css.facts}>
                {[{ label: t('recordsCode'), value: active.code }, { label: t('recordsOwner'), value: text(active.owner_name) || t('unassigned') }, { label: t('recordsProject'), value: active.project_name }, ...rows(active.fields)].filter(field => text(field.value)).map(field => <div key={text(field.label)}><dt>{text(field.label)}</dt><dd>{text(field.value)}</dd></div>)}
              </dl></aside>}
          </div>}
        </section>}
      </>}
      <footer className={css.footer}><button type="button" className={css.textButton} onClick={() => { setDiagnostics(true) }}>{t('developerTools')}</button></footer>
    </div>
  </div>
}
