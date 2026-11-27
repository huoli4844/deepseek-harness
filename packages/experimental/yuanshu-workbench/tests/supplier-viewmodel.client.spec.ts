/** 验证供应商列表解析、检索和分页口径。 */
import { expect, it } from 'vitest'
import { parseSupplierPage } from '../src/client/modules/business-modules/supplier-api.ts'
import { errorState, supplierStats } from '../src/client/modules/business-modules/supplier-viewmodel.ts'

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

it('聚合供应商准入、停用、平均评分与分类前六项', () => {
  const items = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1,
    name: `供应商${index + 1}`,
    supplier_type: index === 0 ? 'service' : 'material',
    admission_status: index < 3 ? 'approved' : index === 3 ? 'pending' : index === 4 ? 'rejected' : 'suspended',
    total_score: index < 2 ? '4.0' : undefined,
    status: index === 0 ? 0 : 1,
    category: `C${index + 1}`,
  }))
  const page = parseSupplierPage({ data: { items, total: 7 } }, 1, 200)
  const stats = supplierStats(page.items, 7, false)
  expect(stats).toMatchObject({ total: 7, approved: 3, pending: 1, rejected: 1, disabled: 1 })
  expect(stats.averageScore).toBe(4)
  expect(stats.admissions.map(bucket => [bucket.key, bucket.count]))
    .toEqual([['pending', 1], ['approved', 3], ['rejected', 1], ['other', 2]])
  expect(stats.types).toEqual([{ key: 'material', count: 6 }, { key: 'service', count: 1 }])
  expect(stats.categories.map(bucket => bucket.key)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6'])
})

it('按区间聚合五个评分维度，0 分和空值计为未评分', () => {
  const page = parseSupplierPage({ data: { items: [
    { id: 1, name: 'A', quality_rating: 95, delivery_rating: 83, price_rating: 72, service_rating: 65, total_score: 90 },
    { id: 2, name: 'B', quality_rating: 0, price_rating: 92.5, service_rating: 0, total_score: 0 },
  ], total: 2 } }, 1, 200)
  const stats = supplierStats(page.items, 2, false)
  const scores = Object.fromEntries(stats.scores.map(dimension => [dimension.key, dimension]))
  expect(stats.scores.map(dimension => dimension.key)).toEqual(['quality', 'delivery', 'price', 'service', 'total'])
  expect(scores.quality?.rated).toBe(1)
  expect(scores.quality?.average).toBe(95)
  expect(scores.price?.average).toBe(82.25)
  expect(scores.quality?.ranges).toEqual([
    { key: 'range90', count: 1 }, { key: 'range80', count: 0 }, { key: 'range70', count: 0 },
    { key: 'range60', count: 0 }, { key: 'below60', count: 0 }, { key: 'unrated', count: 1 },
  ])
  expect(scores.delivery?.ranges.map(range => range.count)).toEqual([0, 1, 0, 0, 0, 1])
  expect(scores.price?.ranges.map(range => range.count)).toEqual([1, 0, 1, 0, 0, 0])
  expect(scores.service?.ranges.map(range => range.count)).toEqual([0, 0, 0, 1, 0, 1])
  expect(scores.total?.ranges.map(range => range.count)).toEqual([1, 0, 0, 0, 0, 1])
})
