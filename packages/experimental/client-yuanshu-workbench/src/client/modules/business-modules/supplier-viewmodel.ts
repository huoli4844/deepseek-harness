/** 供应商档案的请求错误分类，不依赖 React 或网络。 */

/** 将请求错误映射为页面状态。 */
export function errorState(error: unknown): 'login' | 'denied' | 'failure' {
  const kind = error instanceof Error && 'kind' in error ? error.kind : undefined
  return kind === 'login' || kind === 'denied' ? kind : 'failure'
}
