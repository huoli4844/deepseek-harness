/**
 * 运营者工作台的纯展示原子组件。
 *
 * 这里每个组件都只依赖 props：不请求数据、不持有状态，
 * 也不决定档位 / 来源——那是视图模型层的职责。
 * 它们统一渲染 `Field<T>`：有值显示真实值，无值显示 `— — —` 占位符，
 * 状态标签与数据出处由字段的档位和来源决定。
 */
import type { ReactNode } from 'react'
import { Tag, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { Availability, Field, OperatorLocaleKey } from '../model.ts'
import { PLACEHOLDER } from '../constants.ts'
import css from '../operator.module.css'

export { PLACEHOLDER } from '../constants.ts'

/** 工作台命名空间的翻译函数。 */
export type OperatorT = TranslateNS<'yuanshu.workbench'>

/** 将数据档位映射为状态标签色调（颜色语义）。 */
function toneFor(tier: Availability): TagTone {
  return tier === 'ready' ? 'success' : tier === 'schema-pending' ? 'info' : 'warning'
}

/** 档位对应的状态标签文案 key。 */
function labelKeyFor(tier: Availability): OperatorLocaleKey {
  return tier === 'ready' ? 'operator.tier.ready'
    : tier === 'schema-pending' ? 'operator.tier.schemaPending'
      : 'operator.tier.notConnected'
}

/**
 * 每个占位符附带的状态标签 + 来源标注。
 * @param props.tier - 字段的可用性档位。
 * @param props.source - 视图模型提供的来源标识。
 * @param props.t - 命名空间翻译函数。
 */
export function Provenance({ tier, source, t }: {
  readonly tier: Availability
  readonly source: string
  readonly t: OperatorT
}) {
  return <span className={css.provenance}>
    <Tag tone={toneFor(tier)}>{t(labelKeyFor(tier))}</Tag>
    <span className={css.source}>{t('operator.label.source')} · {source}</span>
  </span>
}

/**
 * 渲染展示字段：有值显示值，无值显示占位符。
 * 占位符始终附带档位标签与来源标注。
 * @param props.field - 待渲染的字段。
 * @param props.t - 命名空间翻译函数。
 * @param props.emphasis - 是否使用大号 KPI 数字样式。
 */
export function FieldValue({ field, t, emphasis }: {
  readonly field: Field<string>
  readonly t: OperatorT
  readonly emphasis?: boolean | undefined
}) {
  const empty = field.value === undefined || field.value.trim() === ''
  return <span className={emphasis ? css.kpiValue : undefined}>
    <span className={empty ? css.placeholder : undefined}>
      {empty ? PLACEHOLDER : field.value}
    </span>
    <Provenance tier={field.tier} source={field.source} t={t} />
  </span>
}

/** 各页面通用的带标题区块容器。 */
export function Section({ title, children, className }: {
  readonly title: string
  readonly children: ReactNode
  readonly className?: string | undefined
}) {
  return <section role="region" aria-label={title}
    className={className === undefined ? css.section : `${css.section} ${className}`}>
    <h2 className={css.sectionTitle}>{title}</h2>
    {children}
  </section>
}

/** 空状态文案：绝不编造 0 值。 */
export function EmptyLine({ text }: { readonly text: string }) {
  return <p className={css.empty}>{text}</p>
}
