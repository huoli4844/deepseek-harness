/**
 * 运营者工作台的纯展示原子组件。
 *
 * 这里每个组件都只依赖 props：不请求数据、不持有状态。
 * 它们统一渲染 `Field<T>`：有值显示真实值，无值显示 `— — —` 占位符。
 * 界面上不展示接口状态 / 数据来源等元信息。
 */
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { Field } from '../model.ts'
import { PLACEHOLDER } from '../constants.ts'
import css from '../operator.module.css'

export { PLACEHOLDER } from '../constants.ts'

/** 工作台命名空间的翻译函数。 */
export type OperatorT = TranslateNS<'yuanshu.workbench'>

/**
 * 渲染展示字段：有值显示值，无值显示占位符。
 * @param props.field - 待渲染的字段。
 * @param props.emphasis - 是否使用大号 KPI 数字样式。
 */
export function FieldValue({ field, emphasis }: {
  readonly field: Field<string>
  readonly emphasis?: boolean | undefined
}) {
  const empty = field.value === undefined || field.value.trim() === ''
  return <span className={emphasis ? css.kpiValue : undefined}>
    <span className={empty ? css.placeholder : undefined}>
      {empty ? PLACEHOLDER : field.value}
    </span>
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

/** 空状态文案。 */
export function EmptyLine({ text }: { readonly text: string }) {
  return <p className={css.empty}>{text}</p>
}
