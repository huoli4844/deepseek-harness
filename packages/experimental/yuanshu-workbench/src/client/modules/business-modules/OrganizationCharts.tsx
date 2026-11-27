/** 组织架构图表组件：角色分布柱状图、年度入职/累计/离职折线图与在司时间分布柱状图。
 * 全部图表带纵坐标刻度，且支持鼠标悬停显示数据。不发起请求、不承载业务规则。 */
import { useState } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { OrganizationMonthlyPoint, OrganizationTenureBucket } from './organization-model.ts'
import chartsCss from './organization-charts.module.css'

/** 折线图画布尺寸：坐标固定，实际宽高由容器拉伸。 */
const chartWidth = 240
const chartHeight = 140
const chartBaseline = 128
const chartScale = 108

/** 在司时间分段对应的文案键。 */
const tenureLabelKeys: Record<OrganizationTenureBucket, Parameters<WorkbenchT>[0]> = {
  lt1: 'organization.stat.tenureLt1',
  y1to3: 'organization.stat.tenureY1to3',
  y3to5: 'organization.stat.tenureY3to5',
  y5to10: 'organization.stat.tenureY5to10',
  gte10: 'organization.stat.tenureGte10',
}

/** 把数据最大值向上取整为整洁刻度（1/2/5×10ⁿ），让纵轴标签是整数。 */
function niceCeil(value: number): number {
  if (value <= 5) return Math.max(1, Math.ceil(value))
  const pow = 10 ** Math.floor(Math.log10(value))
  for (const mult of [1, 2, 5, 10]) {
    const candidate = mult * pow
    if (candidate >= value) return candidate
  }
  return 10 * pow
}

/** 生成纵轴刻度：最大值不超过 5 时逐整数刻度，否则取 0、中值、最大值。 */
function yTicks(max: number): readonly number[] {
  if (max <= 5) return Array.from({ length: max + 1 }, (_, index) => index)
  return [0, max / 2, max]
}

/** 纵坐标刻度列：labels 为刻度值，pcts 为对应百分比位置；柱状图自底部起算，折线图自顶部起算（含顶部留白）。 */
function YAxis({ labels, pcts, alignFromBottom, height }: {
  readonly labels: readonly number[]
  readonly pcts: readonly number[]
  readonly alignFromBottom: boolean
  /** 不传高度时由网格行高拉伸对齐图表高度。 */
  readonly height?: number
}) {
  return <div className={chartsCss.chartYAxis}
    style={height === undefined ? undefined : { height: `${String(height)}px` }} aria-hidden="true">
    {labels.map((tick, index) => <span key={tick}
      style={alignFromBottom
        ? { bottom: `${String(pcts[index])}%` }
        : { top: `${String(pcts[index])}%` }}>
      {String(tick)}
    </span>)}
  </div>
}

/** 柱状图单项：key 供 React 复用，name 为轴标签，tip 为悬停提示文案。 */
interface BarItem {
  readonly key: string
  readonly name: string
  readonly tip: string
  readonly count: number
}

/** 柱状图轨道高度，需与 CSS 中 .barTrack 保持一致。 */
const barTrackHeight = 180
/** 柱状图纵向占比：顶部留 10% 余量，避免最大刻度标签顶出绘图区压住标题。 */
const barScalePct = 90

/** 通用柱状图：纵轴刻度对齐柱轨，悬停柱体时在柱顶显示名称与人数。 */
function BarChart({ items, label }: { readonly items: readonly BarItem[]; readonly label: string }) {
  const max = niceCeil(Math.max(1, ...items.map(item => item.count)))
  const ticks = yTicks(max)
  return <div className={chartsCss.barWithAxis}>
    <YAxis labels={ticks} pcts={ticks.map(tick => tick / max * barScalePct)} alignFromBottom
      height={barTrackHeight} />
    <div className={chartsCss.barRow} role="img" aria-label={label}>
      {items.map(item => <div key={item.key} className={chartsCss.barSlot}>
        <span className={chartsCss.barTip} role="status">{item.tip}</span>
        <span className={chartsCss.barTrack}>
          <span className={chartsCss.bar}
            style={{ height: `${String(item.count / max * barScalePct)}%` }} />
        </span>
        <span className={chartsCss.barName}>{item.name}</span>
      </div>)}
    </div>
  </div>
}

/** 通用月度折线图：纵轴刻度与横向网格线对齐，悬停任意月份列时在数据点上显示月份与数值。 */
function MetricChart({ points, metric, label, t }: {
  readonly points: readonly OrganizationMonthlyPoint[]
  readonly metric: 'joined' | 'departed' | 'total'
  readonly label: string
  readonly t: WorkbenchT
}) {
  const [hoverIndex, setHoverIndex] = useState<number>()
  const max = niceCeil(Math.max(1, ...points.map(point => point[metric])))
  const ticks = yTicks(max)
  const step = chartWidth / points.length
  const coordinates = points.map((point, index) => ({
    x: index * step + step / 2,
    y: chartBaseline - (point[metric] / max) * chartScale,
    text: `${point.month} · ${String(point[metric])}${t('organization.stat.people')}`,
  }))
  const hover = hoverIndex !== undefined ? coordinates[hoverIndex] : undefined
  return <div className={chartsCss.chartWithAxis}>
    {/* 折线图刻度位置需计入顶部留白：最大值停在 baseline-scale 而非画布顶部。 */}
    <YAxis labels={ticks} alignFromBottom={false}
      pcts={ticks.map(tick => (chartBaseline - tick / max * chartScale) / chartHeight * 100)} />
    <div className={chartsCss.chartWrap} role="img" aria-label={label}
      onMouseLeave={() => { setHoverIndex(undefined) }}>
      <svg className={chartsCss.chart} viewBox={`0 0 ${String(chartWidth)} ${String(chartHeight)}`}
        preserveAspectRatio="none" aria-hidden="true">
        {/* 网格线对齐纵轴刻度；non-scaling-stroke 保证拉伸后虚线粗细不变。 */}
        {ticks.filter(tick => tick > 0).map(tick => <line key={tick} className={chartsCss.chartGrid}
          x1={0} x2={chartWidth} y1={chartBaseline - tick / max * chartScale}
          y2={chartBaseline - tick / max * chartScale} vectorEffect="non-scaling-stroke" />)}
        <polyline className={chartsCss.chartLine} fill="none"
          points={coordinates.map(point => `${String(point.x)},${String(point.y)}`).join(' ')} />
        {coordinates.map((point, index) => <circle key={index} className={chartsCss.chartDot}
          cx={point.x} cy={point.y} r={index === hoverIndex ? 3.6 : 2.2} />)}
      </svg>
      {/* 命中区按月份等宽铺满整列，避免细小的点难以悬停。 */}
      {coordinates.map((point, index) => <button key={index} type="button" tabIndex={-1}
        className={chartsCss.chartHit} style={{ left: `${String(index * step / chartWidth * 100)}%`,
          width: `${String(step / chartWidth * 100)}%` }}
        onMouseEnter={() => { setHoverIndex(index) }}
        aria-label={point.text} />)}
      {hover !== undefined && <div className={chartsCss.chartTip} role="status"
        style={{ left: `${String(hover.x / chartWidth * 100)}%`, top: `${String(hover.y / chartHeight * 100)}%` }}>
        {hover.text}
      </div>}
    </div>
    {/* 月份轴与绘图区同列对齐（网格第二行），样式与纵轴刻度一致。 */}
    <span aria-hidden="true" />
    <ol className={chartsCss.chartMonths} aria-hidden="true">
      {points.map((point, index) => <li key={point.month}>{String(index + 1)}</li>)}
    </ol>
  </div>
}

/** 柱状图脚注：说明统计口径，保证数据来源可追溯。 */
function ChartHint({ text }: { readonly text: string }) {
  return <span className={chartsCss.chartHint}>{text}</span>
}

/** 角色分布柱状图：每根柱代表一个角色，悬停显示角色名与人数。 */
export function OrganizationRoleChart({ roles, t }: {
  readonly roles: readonly { readonly name: string; readonly count: number }[]
  readonly t: WorkbenchT
}) {
  const items: BarItem[] = roles.map(role => ({
    key: role.name,
    name: role.name,
    count: role.count,
    tip: `${role.name} · ${String(role.count)}${t('organization.stat.people')}`,
  }))
  return <BarChart items={items} label={t('organization.stat.roleDistribution')} />
}

/** 在司时间分布柱状图：按入职时间分段统计当前在职成员，悬停显示分段与人数。 */
export function OrganizationTenureChart({ points, t }: {
  readonly points: readonly { readonly bucket: OrganizationTenureBucket; readonly count: number }[]
  readonly t: WorkbenchT
}) {
  const items: BarItem[] = points.map(point => ({
    key: point.bucket,
    name: t(tenureLabelKeys[point.bucket]),
    count: point.count,
    tip: `${t(tenureLabelKeys[point.bucket])} · ${String(point.count)}${t('organization.stat.people')}`,
  }))
  return <div className={chartsCss.chartFigureBody}>
    <BarChart items={items} label={t('organization.stat.tenure')} />
    <ChartHint text={t('organization.stat.tenureHint')} />
  </div>
}

/** 全年入职折线图。 */
export function OrganizationJoinedChart({ points, t }: {
  readonly points: readonly OrganizationMonthlyPoint[]
  readonly t: WorkbenchT
}) {
  return <MetricChart points={points} metric="joined" label={t('organization.stat.hired')} t={t} />
}

/** 全年累计人员折线图。 */
export function OrganizationTotalChart({ points, t }: {
  readonly points: readonly OrganizationMonthlyPoint[]
  readonly t: WorkbenchT
}) {
  return <MetricChart points={points} metric="total" label={t('organization.stat.history')} t={t} />
}

/** 全年离职折线图：按各月入职且当前已离职的人数统计。 */
export function OrganizationDepartedChart({ points, t }: {
  readonly points: readonly OrganizationMonthlyPoint[]
  readonly t: WorkbenchT
}) {
  return <div className={chartsCss.chartFigureBody}>
    <MetricChart points={points} metric="departed" label={t('organization.stat.departed')} t={t} />
    <ChartHint text={t('organization.stat.departedHint')} />
  </div>
}
