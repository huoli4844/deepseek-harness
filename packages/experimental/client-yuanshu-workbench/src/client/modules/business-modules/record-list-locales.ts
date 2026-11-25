/** 维护客户和供应商列表复用的中英文分页文案。 */
export const recordListEn = {
  'record.search': 'Search',
  'record.pageNumber': 'Go to page {page}',
  'record.jumpPage': 'Page number',
  'record.jump': 'Go',
} as const

export const recordListZh: Record<keyof typeof recordListEn, string> = {
  'record.search': '搜索',
  'record.pageNumber': '转到第 {page} 页',
  'record.jumpPage': '指定页',
  'record.jump': '跳转',
}
