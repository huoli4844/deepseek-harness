/** 验证供应商列表解析、检索和分页口径。 */
import { expect, it } from 'vitest'
import { parseSupplierPage } from '../src/client/modules/business-modules/supplier-api.ts'
import { errorState } from '../src/client/modules/business-modules/supplier-viewmodel.ts'

it('读取总数和分页信息，缺失状态时保留空值', () => {
  const page = parseSupplierPage({
    data: { list: [{ id: 1, name: '供应商', supplier_type: 'material', admission_status: 'pending' }],
      pagination: { total: '31', page: 2, page_size: 20 } },
  }, 1, 200)
  expect(page).toMatchObject({ total: 31, page: 2, pageSize: 20 })
  expect(page.items).toMatchObject([{ supplierType: 'material', admissionStatus: 'pending', status: undefined }])
  expect(() => parseSupplierPage({ error: '无效列表' }, 1, 20)).toThrow()
})

it('保留后台返回的供应商主档扩展字段和审计字段', () => {
  const page = parseSupplierPage({ data: { items: [{
    id: 7, name: '供应商', code: 'S-7', bank_info: '开户行', payment_terms: '月结',
    quality_rating: '4.5', delivery_rating: 4, price_rating: 3.5, service_rating: 5,
    total_score: '4.25', owner_user_id: 12, remark: '备注', created_by: 9,
    created_at: '2026-11-12T13:11:39Z', updated_at: '2026-11-13T13:11:39Z',
  }], total: 1 } }, 1, 20)
  expect(page.items[0]).toMatchObject({
    bankInfo: '开户行', paymentTerms: '月结', qualityRating: 4.5, deliveryRating: 4,
    priceRating: 3.5, serviceRating: 5, totalScore: 4.25, ownerUserId: 12,
    remark: '备注', createdBy: 9, createdAt: '2026-11-12T13:11:39Z', updatedAt: '2026-11-13T13:11:39Z',
  })
})

it('区分无权限和普通请求错误', () => {
  expect(errorState(Object.assign(new Error(), { kind: 'denied' }))).toBe('denied')
  expect(errorState(new Error())).toBe('failure')
})
