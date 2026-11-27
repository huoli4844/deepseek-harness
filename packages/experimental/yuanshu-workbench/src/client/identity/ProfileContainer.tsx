/** 在个人资料打开时读取权限。展示逻辑由资料页处理。 */
import { useEffect, useState } from 'react'
import { createProfilePermissionsRequest, type PermissionNode } from './profile-permissions-source.ts'
import { ProfileScreen, type IdentityT } from './components/ProfileScreen.tsx'
import type { IdentityViewModel } from './model.ts'
import { filterProfilePermissions } from './profile-permissions-viewmodel.ts'

/** 将当前登录用户的有效权限交给资料页。 */
export function ProfileContainer({ model, t }: { readonly model: IdentityViewModel; readonly t: IdentityT }) {
  const [permissions, setPermissions] = useState<readonly PermissionNode[] | null | undefined>()
  const [query, setQuery] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const request = createProfilePermissionsRequest()
    const onStorage = () => {
      if (!request.isCurrent()) {
        controller.abort()
        setPermissions(null)
      }
    }
    window.addEventListener('storage', onStorage)
    void request.load(AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]))
      .catch(() => null)
      .then((codes) => {
        if (!controller.signal.aborted) setPermissions(request.isCurrent() ? codes : null)
      })
    return () => {
      controller.abort()
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  const search = permissions?.length ? {
    query, onQueryChange: setQuery, matches: filterProfilePermissions(permissions, query),
  } : undefined
  return <ProfileScreen model={model} t={t} permissions={permissions} permissionSearch={search} />
}
