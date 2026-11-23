/** 身份模块对外暴露的公共接口。 */
export { Avatar } from './components/Avatar.tsx'
export { UserBadge } from './components/UserBadge.tsx'
export { ProfileScreen, type IdentityT } from './components/ProfileScreen.tsx'
export { useIdentity } from './useIdentity.ts'
export { buildIdentityViewModel, gradientOf, initialsOf } from './viewmodel.ts'
export {
  createEmptyIdentitySource,
  createLiveIdentitySource,
  parseLaborHours,
  parseMe,
  parseProfile,
} from './source.ts'
export { EMPTY_IDENTITY } from './model.ts'
export type { IdentitySource, IdentityUserModel, IdentityViewModel, RawIdentity } from './model.ts'
