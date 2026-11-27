/**
 * 身份模块的领域模型。
 *
 * 本文件只定义类型与稳定字面量，不引入 React、fetch 或任何界面文案。
 * 它同时是数据层、视图模型层与展示层的共享词汇表。
 */
import type { identityEn } from './identity-locales.ts'

/** 模块自有文案 key，拼错会在编译期报错。 */
export type IdentityLocaleKey = keyof typeof identityEn

/** 字段来源档位：接口真实值、演示占位值、无值。 */
export type IdentityFieldTier = 'live' | 'demo' | 'missing'

/** 与来源绑定的展示字段。 */
export interface IdentityField<T> {
  readonly value: T | undefined
  readonly tier: IdentityFieldTier
  readonly source: string
}

/** 后台 `/user/me` 中的用户与角色。 */
export interface RawUser {
  readonly id: number
  readonly username: string
  readonly nickname: string
  readonly roles: readonly RawRole[]
  /** 后台可能返回头像地址；当前契约未声明，按可选字段容忍。 */
  readonly avatarUrl: string | undefined
}

/** 后台角色摘要。 */
export interface RawRole {
  readonly id: number
  readonly name: string
  readonly code: string
}

/** 人员工时原始行。 */
export interface RawLaborRow {
  readonly person: string
  readonly project: string
  readonly hours: number
  readonly status: string
}

/** 任职记录原始行（来自 `/user-positions`，岗位名称由后台联查回填）。 */
export interface RawPositionAssignment {
  readonly id: number
  /** 归属用户；后台返回时用于剔除他人记录，缺省表示无法判定。 */
  readonly userId?: number | undefined
  readonly positionId?: number | undefined
  readonly positionDescription?: string | undefined
  readonly status?: number | undefined
  readonly positionName: string
  readonly positionLevel: string
  readonly positionCategory: string
  readonly roleInProject: string
  readonly startDate: string
  readonly endDate: string
  readonly isPrimary: boolean
}

/** 各段是否来自演示数据（接口缺失或不可用时由数据层补齐）。 */
export interface IdentityFallback {
  readonly user: boolean
  readonly profile: boolean
  readonly laborHours: boolean
  /** 工作台岗位接口是否缺失。 */
  readonly position: boolean
}

/** 数据层产出、尚未解释的身份快照。 */
export interface RawIdentity {
  readonly user: RawUser | undefined
  readonly profile: Record<string, unknown> | undefined
  /** 工作台岗位名称（如「采购」），来自 `/apps/shaoshi/workbench/position`。 */
  readonly position: string | undefined
  readonly laborHours: readonly RawLaborRow[] | undefined
  /** 当前岗位主数据中的描述。 */
  readonly positionDescription?: string | undefined
  readonly fallback: IdentityFallback
  readonly fetchedAt: number | undefined
}

/** 空快照：首帧加载期间使用，不产生任何演示值。 */
export const EMPTY_IDENTITY: RawIdentity = {
  user: undefined,
  profile: undefined,
  position: undefined,
  laborHours: undefined,
  fallback: { user: false, profile: false, laborHours: false, position: false },
  fetchedAt: undefined,
}

/** 容器层注入的数据源契约，测试可替换。 */
export interface IdentitySource {
  load(signal: AbortSignal): Promise<RawIdentity>
}

/** 用于头像渲染的用户展示模型。 */
export interface IdentityUserModel {
  readonly displayName: string
  /** 当前用户的数字 ID，用于按人筛选工时；演示数据时为 undefined。 */
  readonly userId: number | undefined
  /** 姓名首字（中文取第一个字，英文取首字母大写）。 */
  readonly initials: string
  readonly idText: string
  readonly roleText: string
  readonly roles: readonly string[]
  /** 后台角色编码（来自 `/user/me` 的 roles），用于判定工作台视角；演示数据为空。 */
  readonly roleCodes: readonly string[]
  readonly avatarUrl: string | undefined
  /** 无头像接口时生成的蓝绿渐变色对。 */
  readonly gradient: readonly [string, string]
  readonly tier: IdentityFieldTier
  /** 「部门 · 岗位」摘要行；两者皆缺时为空串（徽章不渲染该行）。 */
  readonly orgText: string
}

/** 个人资料中的一行。 */
export interface ProfileEntryModel {
  readonly id: string
  readonly labelKey: IdentityLocaleKey
  readonly field: IdentityField<string>
}

/** 工时表格中的一行。 */
export interface LaborRowModel {
  readonly id: string
  readonly person: IdentityField<string>
  readonly project: IdentityField<string>
  readonly hours: IdentityField<string>
  readonly status: IdentityField<string>
}

/** 身份模块完整视图模型。 */
export interface IdentityViewModel {
  readonly user: IdentityUserModel
  readonly profile: readonly ProfileEntryModel[]
  /** 当前任职所关联的岗位描述，兼容工作台档案已有的职责字段。 */
  readonly duty: IdentityField<string>
  readonly laborHours: {
    readonly rows: readonly LaborRowModel[]
    readonly total: IdentityField<string>
    readonly source: string
  }
  readonly fetchedAt: string | undefined
}
