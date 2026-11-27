/** React 订阅 ObservableSnapshot 的最小适配器。 */
import { useCallback, useSyncExternalStore } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

/**
 * 订阅一个稳定的快照源并返回当前值。
 * @param source - 身份稳定的可观察快照。
 * @returns 当前快照值。
 */
export function useSnapshot<T>(source: ObservableSnapshot<T>): T {
  const subscribe = useCallback((listener: () => void) => source.subscribe(listener), [source])
  const getSnapshot = useCallback(() => source.getSnapshot(), [source])
  return useSyncExternalStore(subscribe, getSnapshot)
}
