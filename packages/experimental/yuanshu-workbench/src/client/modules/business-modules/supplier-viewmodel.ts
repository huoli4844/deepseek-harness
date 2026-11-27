/** 供应商档案的请求错误分类，不依赖 React 或网络。 */
import type { SupplierRecord } from './supplier-model.ts'

/** 将请求错误映射为页面状态。 */
export function errorState(error: unknown): 'login' | 'denied' | 'failure' {
  const kind = error instanceof Error && 'kind' in error ? error.kind : undefined
  return kind === 'login' || kind === 'denied' ? kind : 'failure'
}

/** 单个统计分组：取值为空时 key 为空字符串，界面按「未填写」或「未分类」展示。 */
export interface SupplierStatBucket {
  readonly key: string
  readonly count: number
}

/** 准入状态统计的固定分组键，未识别的后台取值统一归入 other。 */
export type SupplierAdmissionKey = 'pending' | 'approved' | 'rejected' | 'other'

/** 准入状态分组与数量。 */
export interface SupplierAdmissionBucket {
  readonly key: SupplierAdmissionKey
  readonly count: number
}

/** 供应商页面顶部的统计结果，来自全量档案聚合。 */
export interface SupplierStats {
  readonly total: number
  readonly shown: number
  readonly approved: number
  readonly pending: number
  readonly rejected: number
  readonly disabled: number
  readonly averageScore: number | undefined
  readonly types: readonly SupplierStatBucket[]
  readonly typeOptions: readonly string[]
  readonly admissions: readonly SupplierAdmissionBucket[]
  readonly categories: readonly SupplierStatBucket[]
  readonly scores: readonly SupplierScoreDimension[]
  readonly truncated: boolean
}

/** 评分区间筛选项：类型与准入状态为空表示不限。 */
export interface SupplierScoreFilter {
  readonly type: string
  readonly admission: string
}

/** 默认评分筛选项：不限类型与准入状态。 */
export const emptyScoreFilter: SupplierScoreFilter = { type: '', admission: '' }

/** 评分维度：质量、交付、价格、服务与综合。 */
export type SupplierScoreKey = 'quality' | 'delivery' | 'price' | 'service' | 'total'

/** 评分区间：每 10 分一档，0 分和空值按未评分统计。 */
export type SupplierScoreRangeKey = 'range90' | 'range80' | 'range70' | 'range60' | 'below60' | 'unrated'

/** 单个评分区间内的供应商数量。 */
export interface SupplierScoreRange {
  readonly key: SupplierScoreRangeKey
  readonly count: number
}

/** 单个评分维度的区间分布、已评分数量与已评分平均分；平均分不含 0 分档案。 */
export interface SupplierScoreDimension {
  readonly key: SupplierScoreKey
  readonly rated: number
  readonly average: number | undefined
  readonly ranges: readonly SupplierScoreRange[]
}

/** 五个评分维度的取值来源，顺序即界面展示顺序。 */
const scoreDimensions: readonly {
  readonly key: SupplierScoreKey
  readonly pick: (record: SupplierRecord) => number | undefined
}[] = [
  { key: 'quality', pick: record => record.qualityRating },
  { key: 'delivery', pick: record => record.deliveryRating },
  { key: 'price', pick: record => record.priceRating },
  { key: 'service', pick: record => record.serviceRating },
  { key: 'total', pick: record => record.totalScore },
]

/** 评分区间固定顺序，供界面稳定渲染。 */
const scoreRangeKeys: readonly SupplierScoreRangeKey[] = ['range90', 'range80', 'range70', 'range60', 'below60', 'unrated']

/** 把单个评分归入区间；0 分与空值表示尚未评分。 */
function scoreRange(value: number | undefined): SupplierScoreRangeKey {
  if (value === undefined || value === 0) return 'unrated'
  if (value >= 90) return 'range90'
  if (value >= 80) return 'range80'
  if (value >= 70) return 'range70'
  if (value >= 60) return 'range60'
  return 'below60'
}

/** 汇总单个评分维度的区间人数、已评分数量与已评分平均分。 */
function scoreDimension(
  key: SupplierScoreKey,
  pick: (record: SupplierRecord) => number | undefined,
  records: readonly SupplierRecord[],
): SupplierScoreDimension {
  const counts: Record<SupplierScoreRangeKey, number> = {
    range90: 0, range80: 0, range70: 0, range60: 0, below60: 0, unrated: 0,
  }
  let rated = 0
  let scoreSum = 0
  for (const record of records) {
    const value = pick(record)
    if (value !== undefined && value > 0) {
      rated += 1
      scoreSum += value
    }
    counts[scoreRange(value)] += 1
  }
  return {
    key,
    rated,
    average: rated === 0 ? undefined : scoreSum / rated,
    ranges: scoreRangeKeys.map(range => ({ key: range, count: counts[range] })),
  }
}

/** 分类分布最多展示的分组数。 */
const CATEGORY_LIMIT = 6

/** 按取值分组计数，数量降序、键名升序；空值保留为空字符串键。 */
function buckets(records: readonly SupplierRecord[], pick: (record: SupplierRecord) => string): readonly SupplierStatBucket[] {
  const counts = new Map<string, number>()
  for (const record of records) {
    const key = pick(record).trim()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
}

/** 后台准入状态值归一为固定分组。 */
function admissionKey(value: string): SupplierAdmissionKey {
  switch (value.trim()) {
    case 'approved': return 'approved'
    case 'pending': return 'pending'
    case 'rejected': return 'rejected'
    default: return 'other'
  }
}

/** 汇总供应商总量、准入与停用指标、平均综合评分及类型、准入、分类分布。 */
export function supplierStats(
  records: readonly SupplierRecord[],
  total: number,
  truncated: boolean,
  filter: SupplierScoreFilter = emptyScoreFilter,
): SupplierStats {
  const counts: Record<SupplierAdmissionKey, number> = { pending: 0, approved: 0, rejected: 0, other: 0 }
  let disabled = 0
  let scoreSum = 0
  let scoreCount = 0
  for (const record of records) {
    counts[admissionKey(record.admissionStatus)] += 1
    if (record.status === 0) disabled += 1
    if (record.totalScore !== undefined) {
      scoreSum += record.totalScore
      scoreCount += 1
    }
  }
  // 评分区间按页内筛选后的档案统计；类型与准入分布仍按全量展示。
  const scoped = filter.type === '' && filter.admission === ''
    ? records
    : records.filter(record => (filter.type === '' || record.supplierType === filter.type)
      && (filter.admission === '' || admissionKey(record.admissionStatus) === filter.admission))
  return {
    total,
    shown: scoped.length,
    approved: counts.approved,
    pending: counts.pending,
    rejected: counts.rejected,
    disabled,
    averageScore: scoreCount === 0 ? undefined : scoreSum / scoreCount,
    types: buckets(records, record => record.supplierType),
    typeOptions: [...new Set(records.map(record => record.supplierType.trim()).filter(type => type !== ''))].sort(),
    admissions: [
      { key: 'pending', count: counts.pending },
      { key: 'approved', count: counts.approved },
      { key: 'rejected', count: counts.rejected },
      { key: 'other', count: counts.other },
    ],
    categories: buckets(records, record => record.category).slice(0, CATEGORY_LIMIT),
    scores: scoreDimensions.map(dimension => scoreDimension(dimension.key, dimension.pick, scoped)),
    truncated,
  }
}
