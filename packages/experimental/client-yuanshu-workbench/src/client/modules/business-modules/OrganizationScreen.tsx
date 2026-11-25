/** 组织架构页面：左侧部门树，右侧按所选部门分页展示成员并支持搜索。 */
import { useMemo, useState } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import { OrganizationTree } from './OrganizationTree.tsx'
import type { DepartmentNode, OrganizationMember } from './organization-model.ts'
import type { OrganizationRequestError } from './use-organization.ts'
import { useOrganization } from './use-organization.ts'
import css from './organization.module.css'

function collectDepartmentNames(nodes: readonly DepartmentNode[], out: Map<number, string>): void {
  for (const node of nodes) {
    out.set(node.id, node.name)
    collectDepartmentNames(node.children, out)
  }
}

function errorCopy(t: WorkbenchT, kind: OrganizationRequestError, fallback: 'tree' | 'list'): string {
  if (kind === 'login') return t('organization.login')
  if (kind === 'denied') return t('organization.denied')
  return t(fallback === 'tree' ? 'organization.treeError' : 'organization.listError')
}

function MemberRows({ members, names, t }: {
  readonly members: readonly OrganizationMember[]
  readonly names: ReadonlyMap<number, string>
  readonly t: WorkbenchT
}) {
  return members.map(member => <tr key={member.id}>
    <td className={css.nameCell}>{member.nickname || member.username}</td>
    <td>{member.username || '—'}</td>
    <td>{names.get(member.departmentId) ?? t('organization.unassigned')}</td>
    <td>{member.roles.length > 0 ? member.roles.join('、') : '—'}</td>
    <td>{member.phone || '—'}</td>
    <td>{member.email || '—'}</td>
    <td><span className={member.status === 1 ? css.statusActive : css.statusInactive}>
      {t(member.status === 1 ? 'organization.active' : 'organization.inactive')}</span></td>
  </tr>)
}

/** 渲染组织架构树与成员列表。 */
export function OrganizationScreen({ t }: { readonly t: WorkbenchT }) {
  const organization = useOrganization()
  const [draft, setDraft] = useState('')
  const names = useMemo(() => {
    const map = new Map<number, string>()
    collectDepartmentNames(organization.tree ?? [], map)
    return map
  }, [organization.tree])
  const scope = organization.departmentId === undefined
    ? t('organization.allMembers')
    : names.get(organization.departmentId) ?? t('organization.unassigned')
  const pageCount = organization.pageCount ?? 1
  const members = organization.result?.list ?? []
  const showTable = organization.error === undefined && members.length > 0
  const allMembersClass = organization.departmentId === undefined
    ? `${css.allMembers} ${css.allMembersActive}`
    : css.allMembers
  return <div className={css.screen}>
    <header className={css.header}>
      <h2 className={css.title}>{t('organization.title')}</h2>
    </header>
    <div className={css.layout}>
      <aside className={css.treePane} aria-label={t('organization.treeLabel')}>
        <div className={css.paneHeader}>{t('organization.treeLabel')}</div>
        <button type="button" className={allMembersClass}
          onClick={() => { organization.selectDepartment(undefined) }}>{t('organization.allMembers')}</button>
        {organization.tree === undefined
          ? <p className={css.paneState}>
            {organization.treeError === undefined
              ? t('organization.loading')
              : errorCopy(t, organization.treeError, 'tree')}
            {organization.treeError !== undefined && <>
              <button type="button" className={css.linkButton}
                onClick={organization.retryTree}>{t('organization.retry')}</button>
            </>}
          </p>
          : <OrganizationTree nodes={organization.tree} selected={organization.departmentId}
            t={t} onSelect={organization.selectDepartment} />}
      </aside>
      <section className={css.listPane}>
        <div className={css.toolbar}>
          <form className={css.searchForm} role="search"
            onSubmit={(event) => { event.preventDefault(); organization.search(draft) }}>
            <label className={css.searchField}>
              <span className={css.searchLabel}>{t('organization.searchLabel')}</span>
              <input className={css.searchInput} value={draft} placeholder={t('organization.searchPlaceholder')}
                onChange={(event) => { setDraft(event.target.value) }} />
            </label>
            <button type="submit" className={css.searchButton}>{t('organization.search')}</button>
          </form>
          <div className={css.summary}>
            <span className={css.scope}>{scope}</span>
            <span className={css.count}>{t('organization.members')} · {organization.result?.total ?? 0}</span>
          </div>
        </div>
        <div className={css.tableArea}>
          {organization.loading && organization.result === undefined && <p className={css.state}>{t('organization.loading')}</p>}
          {organization.error !== undefined && <p className={css.state} role="alert">
            {errorCopy(t, organization.error, 'list')}
            <button type="button" className={css.linkButton} onClick={organization.retry}>{t('organization.retry')}</button>
          </p>}
          {organization.error === undefined && organization.result !== undefined && members.length === 0
            && <p className={css.state}>{t('organization.empty')}</p>}
          {showTable && <table className={css.table}>
            <thead>
              <tr>
                <th scope="col">{t('organization.memberName')}</th>
                <th scope="col">{t('organization.username')}</th>
                <th scope="col">{t('organization.department')}</th>
                <th scope="col">{t('organization.role')}</th>
                <th scope="col">{t('organization.phone')}</th>
                <th scope="col">{t('organization.email')}</th>
                <th scope="col">{t('organization.status')}</th>
              </tr>
            </thead>
            <tbody><MemberRows members={members} names={names} t={t} /></tbody>
          </table>}
        </div>
        <nav className={css.pagination} aria-label={t('organization.pagination')}>
          <button type="button" className={css.pageButton} disabled={organization.page <= 1}
            onClick={() => { organization.goToPage(organization.page - 1) }}>{t('organization.previousPage')}</button>
          <span className={css.pageStatus}>{organization.page} / {pageCount}</span>
          <button type="button" className={css.pageButton} disabled={organization.page >= pageCount}
            onClick={() => { organization.goToPage(organization.page + 1) }}>{t('organization.nextPage')}</button>
        </nav>
      </section>
    </div>
  </div>
}
