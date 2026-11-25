/** 定义供应商档案和接口结果，仅包含领域与数据类型。 */
/** 供应商档案在页面中使用的字段。 */
export interface SupplierRecord {
  readonly id: number
  readonly code: string
  readonly name: string
  readonly shortName: string
  readonly supplierType: string
  readonly category: string
  readonly contactPerson: string
  readonly contactPhone: string
  readonly contactEmail: string
  readonly address: string
  readonly bankInfo: string
  readonly paymentTerms: string
  readonly qualityRating: number | undefined
  readonly deliveryRating: number | undefined
  readonly priceRating: number | undefined
  readonly serviceRating: number | undefined
  readonly totalScore: number | undefined
  readonly admissionStatus: string
  readonly ownerUserId: number | undefined
  readonly remark: string
  readonly status: number | undefined
  readonly createdBy: number | undefined
  readonly createdAt: string | undefined
  readonly updatedAt: string | undefined
  readonly deletedAt: string | undefined
  readonly sourceBucket: string
  readonly sourceObjectKey: string
  readonly sourceSheet: string
  readonly sourceRowNo: number | undefined
  readonly ingestionBatchId: number | undefined
  readonly evidenceRefId: number | undefined
  readonly confidence: number | undefined
  readonly reviewStatus: string
  readonly businessTenantId: number | undefined
}

/** 新建或更新供应商的表单字段。 */
export type SupplierDraft = Pick<SupplierRecord,
  'code' | 'name' | 'shortName' | 'supplierType' | 'category' | 'contactPerson' |
  'contactPhone' | 'contactEmail' | 'address' | 'admissionStatus' | 'status'
>

/** 供应商列表接口的一页记录与分页总数。 */
export interface SupplierPage {
  readonly items: readonly SupplierRecord[]
  readonly total: number | undefined
  readonly archiveTotal: number | undefined
  readonly page: number
  readonly pageSize: number
}

/** 供应商请求失败的分类。 */
export type SupplierErrorKind = 'login' | 'denied' | 'failure'
