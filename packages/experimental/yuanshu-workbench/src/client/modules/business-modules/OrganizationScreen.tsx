/** 组织架构页面：左侧部门树，右侧按所选部门分页展示成员并支持搜索、编辑与删除。 */
import { useMemo, useState } from 'react'
import {
  Button, IconEditOutlineRegular, IconSearchOutlineRegular, IconTrashOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { OrganizationTree } from './OrganizationTree.tsx'
import { OrganizationStatsPanel } from './OrganizationStatsPanel.tsx'
import { OrganizationMemberDeleteDialog, OrganizationMemberDialog } from './OrganizationMemberDialog.tsx'
import type { DepartmentNode, OrganizationMember } from './organization-model.ts'
import type { OrganizationRequestError } from './use-organization.ts'
import { useOrganization, useOrganizationWrite } from './use-organization.ts'
import businessCss from './business-modules.module.css'
import css from './organization.module.css'

/** 递归统计部门总数（含子部门）。 */
function countDepartments(nodes: readonly DepartmentNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countDepartments(node.children), 0)
}

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

/** 渲染成员行与行级编辑、删除操作。 */
function MemberRows({ members, names, t, onEdit, onDelete, disabled }: {
  readonly members: readonly OrganizationMember[]
  readonly names: ReadonlyMap<number, string>
  readonly t: WorkbenchT
  readonly onEdit: (member: OrganizationMember) => void
  readonly onDelete: (member: OrganizationMember) => void
  readonly disabled: boolean
}) {
  return members.map(member => <tr key={member.id}>
    <td>{member.nickname || member.username}</td>
    <td>{member.username || '—'}</td>
    <td>{names.get(member.departmentId) ?? t('organization.unassigned')}</td>
    <td>{member.roles.length > 0 ? member.roles.join('、') : '—'}</td>
    <td>{member.phone || '—'}</td>
    <td>{member.email || '—'}</td>
    <td><span className={member.status === 1 ? css.statusActive : css.statusInactive}>
      {t(member.status === 1 ? 'organization.active' : 'organization.inactive')}</span></td>
    <td className={css.actionsCell}>
      <div className={businessCss.businessModuleActions}>
        <Tooltip label={t('organization.edit')} side="top" portal>
          <Button size="sm" variant="toolbar" className={businessCss.businessModuleIconButton}
            icon={<IconEditOutlineRegular size={16} />} aria-label={t('organization.edit')}
            disabled={disabled} onClick={() => { onEdit(member) }} />
        </Tooltip>
        <Tooltip label={t('organization.delete')} side="top" portal>
          <Button size="sm" variant="toolbar" className={businessCss.businessModuleIconButton}
            icon={<IconTrashOutlineRegular size={16} />} aria-label={t('organization.delete')}
            disabled={disabled} onClick={() => { onDelete(member) }} />
        </Tooltip>
      </div>
    </td>
  </tr>)
}

/** 渲染组织架构树与成员列表。 */
export function OrganizationScreen({ t }: { readonly t: WorkbenchT }) {
  const organization = useOrganization()
  const write = useOrganizationWrite(() => {
    organization.retry()
    organization.retryTree()
  })
  const [draft, setDraft] = useState('')
  const tree = organization.tree
  const names = useMemo(() => {
    const map = new Map<number, string>()
    collectDepartmentNames(tree?.departments ?? [], map)
    return map
  }, [tree])
  const scope = organization.departmentId === undefined
    ? t('organization.allMembers')
    : organization.departmentId === 0
      ? t('organization.unassigned')
      : names.get(organization.departmentId) ?? t('organization.unassigned')
  const departmentCount = useMemo(() => countDepartments(tree?.departments ?? []), [tree])
  const pageCount = organization.pageCount ?? 1
  const members = organization.result?.list ?? []
  const showTable = organization.error === undefined && members.length > 0
  const allMembersClass = organization.departmentId === undefined
    ? `${css.allMembers} ${css.allMembersActive}`
    : css.allMembers
  const unassignedClass = organization.departmentId === 0
    ? `${css.allMembers} ${css.allMembersActive}`
    : css.allMembers
  return <div className={css.screen}>
    <OrganizationStatsPanel stats={tree?.stats ?? { active: 0, inactive: 0, roles: [], monthly: [], tenure: [] }}
      departmentCount={departmentCount} unassignedCount={tree?.unassignedCount ?? 0} t={t} />
    <div className={css.layout}>
      <aside className={css.treePane} aria-label={t('organization.treeLabel')}>
        <div className={css.paneHeader}>{t('organization.treeLabel')}</div>
        <button type="button" className={allMembersClass}
          onClick={() => { organization.selectDepartment(undefined) }}>{t('organization.allMembers')}</button>
        {tree !== undefined && <button type="button" className={unassignedClass}
          onClick={() => { organization.selectDepartment(0) }}>
          <span>{t('organization.unassigned')}</span>
          <span className={css.treeCount}>{tree.unassignedCount}</span>
        </button>}
        {tree === undefined
          ? <p className={css.paneState}>
            {organization.treeError === undefined
              ? t('organization.loading')
              : errorCopy(t, organization.treeError, 'tree')}
            {organization.treeError !== undefined && <>
              <button type="button" className={css.linkButton}
                onClick={organization.retryTree}>{t('organization.retry')}</button>
            </>}
          </p>
          : <OrganizationTree nodes={tree.departments} selected={organization.departmentId}
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
            <button type="submit" className={css.searchButton} aria-label={t('organization.search')}>
              <IconSearchOutlineRegular />
            </button>
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
                <th scope="col" className={css.actionsHead}>{t('organization.actions')}</th>
              </tr>
            </thead>
            <tbody><MemberRows members={members} names={names} t={t} disabled={write.pending}
              onEdit={write.startEdit} onDelete={write.startDelete} /></tbody>
          </table>}
        </div>
        <nav className={css.pagination} aria-label={t('organization.pagination')}>
          <button type="button" className={css.pageButton} disabled={organization.page <= 1}
            onClick={() => { organization.goToPage(organization.page - 1) }}>{t('organization.previousPage')}</button>
          <span className={css.pageStatus}>{organization.page} / {pageCount}</span>
          <button type="button" className={css.pageButton} disabled={organization.page >= pageCount}
            onClick={() => { organization.goToPage(organization.page + 1) }}>{t('organization.nextPage')}</button>
        </nav>
        {write.outcome !== undefined && write.outcome.kind !== 'error' && <p className={css.writeNotice} role="status">
          {t(write.outcome.kind === 'saved' ? 'organization.saved' : 'organization.deleted')}
          <button type="button" className={css.linkButton}
            onClick={write.dismissOutcome}>{t('organization.closeNotice')}</button>
        </p>}
      </section>
    </div>
    {write.editing !== undefined && <OrganizationMemberDialog key={write.editing.id} member={write.editing}
      departmentName={names.get(write.editing.departmentId) ?? t('organization.unassigned')}
      roles={write.roles} rolesError={write.rolesError} onRetryRoles={write.retryRoles}
      pending={write.pending} error={write.outcome?.kind === 'error' ? write.outcome.error : undefined}
      t={t} onSave={(draft) => { if (write.editing !== undefined) write.save(write.editing, draft) }}
      onClose={write.close} />}
    {write.deleting !== undefined && <OrganizationMemberDeleteDialog member={write.deleting}
      pending={write.pending} error={write.outcome?.kind === 'error' ? write.outcome.error : undefined}
      t={t} onDelete={() => { if (write.deleting !== undefined) write.remove(write.deleting) }}
      onClose={write.close} />}
  </div>
}
