/** 编排组织架构树与成员列表的加载、筛选、分页与成员编辑删除，不渲染页面。 */
import { useCallback, useEffect, useState } from 'react'
import {
  deleteOrganizationMember,
  fetchOrganizationMembers,
  fetchOrganizationRoles,
  fetchOrganizationTree,
  updateOrganizationMember,
  updateOrganizationMemberRoles,
  updateOrganizationMemberStatus,
} from './organization-api.ts'
import type {
  MemberDraft,
  OrganizationMember,
  OrganizationMemberPage,
  OrganizationRole,
  OrganizationTree,
} from './organization-model.ts'
import { RECORD_PAGE_SIZE, recordPageCount } from './record-list-viewmodel.ts'

/** 组织架构请求失败时展示的文案类别。 */
export type OrganizationRequestError = 'login' | 'denied' | 'failure'

/** 成员写操作结果类别：编辑成功、删除成功或失败原因。 */
export type OrganizationWriteState =
  | { readonly kind: 'saved' }
  | { readonly kind: 'deleted' }
  | { readonly kind: 'error'; readonly error: OrganizationRequestError }

function requestError(error: unknown): OrganizationRequestError {
  const status = error instanceof Error && 'status' in error ? error.status : undefined
  if (status === 401) return 'login'
  if (status === 403) return 'denied'
  return 'failure'
}

/** 加载部门树与成员列表；部门或搜索词变化时成员列表回到第一页。 */
export function useOrganization() {
  const [tree, setTree] = useState<OrganizationTree>()
  const [treeError, setTreeError] = useState<OrganizationRequestError>()
  const [treeRetry, setTreeRetry] = useState(0)
  const [query, setQuery] = useState<{
    readonly departmentId: number | undefined
    readonly keyword: string
    readonly page: number
  }>({ departmentId: undefined, keyword: '', page: 1 })
  const [result, setResult] = useState<OrganizationMemberPage>()
  const [error, setError] = useState<OrganizationRequestError>()
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setTreeError(undefined)
    void fetchOrganizationTree(controller.signal).then((data) => {
      if (!controller.signal.aborted) setTree(data)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setTreeError(requestError(reason))
    })
    return () => { controller.abort() }
  }, [treeRetry])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    void fetchOrganizationMembers({ ...query, pageSize: RECORD_PAGE_SIZE }, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      const lastPage = recordPageCount(data.total, data.pageSize)
      if (lastPage !== undefined && query.page > lastPage) {
        setQuery(previous => ({ ...previous, page: lastPage }))
        return
      }
      setResult(data)
      setLoading(false)
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      const kind = requestError(reason)
      if (kind !== 'failure') setResult(undefined)
      setError(kind)
      setLoading(false)
    })
    return () => { controller.abort() }
  }, [query, retry])

  const pageCount = recordPageCount(result?.total, result?.pageSize ?? RECORD_PAGE_SIZE)
  return {
    tree,
    treeError,
    result,
    loading,
    error,
    pageCount,
    departmentId: query.departmentId,
    page: query.page,
    selectDepartment: (departmentId: number | undefined) => {
      setQuery(previous => previous.departmentId === departmentId ? previous : { ...previous, departmentId, page: 1 })
    },
    search: (keyword: string) => {
      const next = keyword.trim()
      setQuery(previous => ({ ...previous, keyword: next, page: 1 }))
    },
    goToPage: (page: number) => {
      if (!Number.isSafeInteger(page) || page < 1 || page > (pageCount ?? 1)) return
      setQuery(previous => previous.page === page ? previous : { ...previous, page })
    },
    retryTree: () => { setTreeRetry(value => value + 1) },
    retry: () => { setRetry(value => value + 1) },
  }
}

/** 编排成员编辑与删除弹窗；成功后由调用方刷新列表和部门树统计。 */
export function useOrganizationWrite(onChanged: () => void) {
  const [editing, setEditing] = useState<OrganizationMember>()
  const [deleting, setDeleting] = useState<OrganizationMember>()
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<OrganizationWriteState>()
  const [roles, setRoles] = useState<readonly OrganizationRole[]>()
  const [rolesError, setRolesError] = useState<OrganizationRequestError>()
  const [rolesRetry, setRolesRetry] = useState(0)

  // 打开编辑弹窗时加载角色列表；失败后可重试。
  useEffect(() => {
    if (editing === undefined) return
    const controller = new AbortController()
    void fetchOrganizationRoles(controller.signal).then((data) => {
      if (!controller.signal.aborted) {
        setRoles(data)
        setRolesError(undefined)
      }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setRolesError(requestError(reason))
    })
    return () => { controller.abort() }
  }, [editing, rolesRetry])

  const startEdit = useCallback((member: OrganizationMember) => {
    setOutcome(undefined)
    setDeleting(undefined)
    setEditing(member)
  }, [])
  const startDelete = useCallback((member: OrganizationMember) => {
    setOutcome(undefined)
    setEditing(undefined)
    setDeleting(member)
  }, [])
  const close = useCallback(() => {
    if (pending) return
    setEditing(undefined)
    setDeleting(undefined)
  }, [pending])
  const dismissOutcome = useCallback(() => { setOutcome(undefined) }, [])
  const retryRoles = useCallback(() => {
    setRoles(undefined)
    setRolesError(undefined)
    setRolesRetry(value => value + 1)
  }, [])

  /** 比较两个角色 ID 集合是否一致（忽略顺序与重复）。 */
  const sameRoleIDs = (left: readonly number[], right: readonly number[]): boolean => {
    if (left.length !== new Set(right).size) return false
    const current = new Set(right)
    return left.every(id => current.has(id))
  }

  const save = useCallback((member: OrganizationMember, draft: MemberDraft) => {
    if (pending) return
    const controller = new AbortController()
    setPending(true)
    setOutcome(undefined)
    void (async () => {
      try {
        await updateOrganizationMember(member.id, draft, controller.signal)
        if (draft.status !== member.status) {
          await updateOrganizationMemberStatus(member.id, draft.status, controller.signal)
        }
        if (!sameRoleIDs(draft.roleIds, member.roleIds)) {
          await updateOrganizationMemberRoles(member.id, draft.roleIds, controller.signal)
        }
        if (!controller.signal.aborted) {
          setEditing(undefined)
          setOutcome({ kind: 'saved' })
          onChanged()
        }
      } catch (reason: unknown) {
        if (!controller.signal.aborted) setOutcome({ kind: 'error', error: requestError(reason) })
      } finally {
        if (!controller.signal.aborted) setPending(false)
      }
    })()
  }, [onChanged, pending])

  const remove = useCallback((member: OrganizationMember) => {
    if (pending) return
    const controller = new AbortController()
    setPending(true)
    setOutcome(undefined)
    void deleteOrganizationMember(member.id, controller.signal).then(() => {
      setDeleting(undefined)
      setOutcome({ kind: 'deleted' })
      onChanged()
    }).catch((reason: unknown) => {
      setOutcome({ kind: 'error', error: requestError(reason) })
    }).finally(() => {
      setPending(false)
    })
  }, [onChanged, pending])

  return {
    editing, deleting, pending, outcome, roles, rolesError,
    startEdit, startDelete, close, save, remove, dismissOutcome, retryRoles,
  }
}
