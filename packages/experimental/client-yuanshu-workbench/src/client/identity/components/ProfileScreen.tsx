/**
 * 个人资料页：当前用户、基础信息与工作台档案。
 * 纯展示组件；数据来自视图模型，文案来自命名空间翻译函数。
 */
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { IdentityField, IdentityFieldTier, IdentityLocaleKey, IdentityViewModel } from '../model.ts'
import { Avatar } from './Avatar.tsx'
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
export function ProfileScreen({ model, t }: {
  readonly model: IdentityViewModel
  readonly t: IdentityT
}) {
  const { user, profile } = model
  return <div className={css.screen}>
    <section className={css.hero} aria-label={t('nav.profile')}>
      <Avatar model={user} size={72} large />
      <div className={css.heroText}>
        <h2>{user.displayName || t('profile.value.unknown')}</h2>
        <p>{t('profile.hero.subtitle')} · {t('profile.label.idInline')} {user.idText || t('profile.value.unknown')}</p>
        <div className={css.roleList}>
          {user.roles.length === 0
            ? <span className={css.roleChip}>{t('profile.value.unknown')}</span>
            : user.roles.map(role => <span key={role} className={css.roleChip}>{role}</span>)}
        </div>
      </div>
    </section>

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

    {/* 任职记录：来自后台 user-positions 接口，按开始时间倒序展示。 */}
    <Section title={t('profile.section.assignments')}>
      {model.assignments.length === 0
        ? <p className={css.fieldValueEmpty}>{t('profile.assignments.empty')}</p>
        : <ul className={css.assignmentList}>
          {model.assignments.map(row => <li key={row.id} className={css.assignmentCard}>
            <div className={css.assignmentHead}>
              <span className={css.assignmentPosition}>{row.position.value ?? t('profile.value.unknown')}</span>
              <span className={row.isPrimary ? css.assignmentPrimary : css.assignmentChip}>
                {t(row.isPrimary ? 'profile.assignments.primary' : 'profile.assignments.secondary')}
              </span>
            </div>
            <dl className={css.assignmentMeta}>
              <div className={css.assignmentLine}>
                <dt>{t('profile.label.department')}</dt>
                <dd>{row.category.value ?? t('profile.value.unknown')}</dd>
              </div>
              <div className={css.assignmentLine}>
                <dt>{t('profile.assignments.role')}</dt>
                <dd>{row.role.value ?? t('profile.value.unknown')}</dd>
              </div>
              <div className={css.assignmentLine}>
                <dt>{t('profile.assignments.period')}</dt>
                <dd>{row.period.value ?? t('profile.value.unknown')}</dd>
              </div>
            </dl>
          </li>)}
        </ul>}
    </Section>

    {/* 岗位职责：来自岗位说明书档案，按顿号 / 分号拆成条目列表。 */}
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

    {/* 数据更新时间只在抓到真实时间时显示，避免出现占位符。 */}
    {model.fetchedAt !== undefined && <footer className={css.freshness}>
      {t('profile.label.updatedAt')}: {model.fetchedAt}
    </footer>}
  </div>
}
