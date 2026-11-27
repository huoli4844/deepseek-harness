/**
 * 个人资料页：当前用户的基础信息与工作台档案。
 * 纯展示组件；数据来自视图模型，文案来自命名空间翻译函数。
 */
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { IdentityField, IdentityFieldTier, IdentityLocaleKey, IdentityViewModel } from '../model.ts'
import type { PermissionNode } from '../profile-permissions-source.ts'
import css from '../identity.module.css'

/** 工作台命名空间的翻译函数。 */
export type IdentityT = TranslateNS<'yuanshu.workbench'>

/** 档位 → 文案 key。 */
function tierKey(tier: IdentityFieldTier): IdentityLocaleKey {
  return tier === 'live' ? 'profile.tier.live'
    : tier === 'demo' ? 'profile.tier.demo'
      : 'profile.tier.missing'
}

/** 单行字段：标签、值与来源档位。 */
function FieldLine({ label, value, t }: {
  readonly label: string
  readonly value: IdentityField<string>
  readonly t: IdentityT
}) {
  return <div className={css.fieldLine}>
    <span className={css.fieldLabel}>{label}</span>
    <span className={value.value === undefined ? css.fieldValueEmpty : css.fieldValue}>
      {value.value ?? t('profile.value.unknown')}
    </span>
    <small className={css.fieldTier}>{t(tierKey(value.tier))}</small>
  </div>
}

/** 通用区块。 */
function Section({ title, children }: {
  readonly title: string
  readonly children: ReactNode
}) {
  return <section className={css.section} aria-label={title}>
    <h3 className={css.sectionTitle}>{title}</h3>
    {children}
  </section>
}

/** 各分区块包含的字段 id（与视图模型 buildProfile 的 id 对应）。 */
const SECTIONS: readonly { readonly titleKey: IdentityLocaleKey; readonly ids: readonly string[] }[] = [
  { titleKey: 'profile.section.basic', ids: ['name', 'id', 'role', 'employeeNo'] },
  { titleKey: 'profile.section.org', ids: ['department', 'position', 'supervisor', 'tenant'] },
  { titleKey: 'profile.section.contact', ids: ['email', 'phone'] },
]

/**
 * 渲染个人资料页。
 * @param props.model - 身份模块视图模型。
 * @param props.t - 命名空间翻译函数。
 */
/** 权限树：已获得的权限显示勾选，未获得显示空框。 */
function PermissionTree({ nodes, t, depth = 0 }: {
  readonly nodes: readonly PermissionNode[]
  readonly t: IdentityT
  readonly depth?: number
}) {
  return <ul className={depth === 0 ? css.permissionsList : css.permissionBranch} tabIndex={depth === 0 ? 0 : undefined}>
    {nodes.map((node, index) => <li key={`${String(index)}-${node.code || node.name}`}>
      <div className={css.permissionRow}>
        <span
          className={css.permissionCheck}
          data-granted={node.granted}
          role="img"
          aria-label={t(node.granted ? 'profile.permissions.granted' : 'profile.permissions.notGranted')}
        />
        <span className={css.permissionName}>{node.name}</span>
      </div>
      {node.children.length > 0 && <PermissionTree nodes={node.children} t={t} depth={depth + 1} />}
    </li>)}
  </ul>
}

export function ProfileScreen({ model, t, permissions, permissionSearch }: {
  readonly model: IdentityViewModel
  readonly permissions?: readonly PermissionNode[] | null | undefined
  readonly permissionSearch?: {
    readonly query: string
    readonly onQueryChange: (query: string) => void
    readonly matches: readonly PermissionNode[]
  } | undefined
  readonly t: IdentityT
}) {
  const { profile } = model
  return <div className={css.screen}>
    <div className={css.columns}>
      {SECTIONS.map((section) => {
        const entries = profile.filter(entry => section.ids.includes(entry.id))
        if (entries.length === 0) return null
        return <Section key={section.titleKey} title={t(section.titleKey)}>
          <div className={css.fieldGrid}>
            {entries.map(entry => <FieldLine
              key={entry.id}
              label={t(entry.labelKey)}
              value={entry.field}
              t={t}
            />)}
          </div>
        </Section>
      })}
    </div>

    {/* 保留岗位描述原有的分号与换行分段。 */}
    <Section title={t('profile.section.duty')}>
      {model.duty.value === undefined
        ? <p className={css.fieldValueEmpty}>{t('profile.value.unknown')}</p>
        : <ul className={css.dutyList}>
          {model.duty.value
            .split(/[；;\n]+/u)
            .map(item => item.trim())
            .filter(item => item !== '')
            .map((item, index) => <li key={index}>{item}</li>)}
        </ul>}
    </Section>

    <Section title={t('profile.section.permissions')}>
      {permissionSearch !== undefined && <input
        className={css.permissionSearch}
        type="search"
        aria-label={t('profile.permissions.search')}
        placeholder={t('profile.permissions.search')}
        value={permissionSearch.query}
        onChange={(event) => { permissionSearch.onQueryChange(event.currentTarget.value) }}
      />}
      {permissions === undefined
        ? <p role="status" className={css.fieldValueEmpty}>{t('profile.permissions.loading')}</p>
        : permissions === null
          ? <p role="status" className={css.fieldValueEmpty}>{t('profile.permissions.unavailable')}</p>
          : permissions.length === 0
            ? <p className={css.fieldValueEmpty}>{t('profile.permissions.empty')}</p>
            : permissionSearch?.matches.length === 0
              ? <p role="status" className={css.fieldValueEmpty}>{t('profile.permissions.noMatch')}</p>
              : <PermissionTree nodes={permissionSearch?.matches ?? permissions} t={t} />}
    </Section>

    {/* 数据更新时间只在抓到真实时间时显示，避免出现占位符。 */}
    {model.fetchedAt !== undefined && <footer className={css.freshness}>
      {t('profile.label.updatedAt')}: {model.fetchedAt}
    </footer>}
  </div>
}
