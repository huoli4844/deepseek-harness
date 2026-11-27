/**
 * 身份模块容器层：持有加载状态，并把数据快照交给纯视图模型。
 * 展示组件不直接调用它之外的任何 I/O。
 */
import { useEffect, useMemo, useState } from 'react'
import { EMPTY_IDENTITY } from './model.ts'
import type { IdentitySource, IdentityViewModel, RawIdentity } from './model.ts'
import { createLiveIdentitySource } from './source.ts'
import { buildIdentityViewModel } from './viewmodel.ts'

/**
 * 加载当前用户、个人资料与工时，返回稳定的展示模型。
 * 数据源失败时数据层会给出演示快照，因此这里只需要保持空快照兜底。
 * @returns 身份模块视图模型。
 */
export function useIdentity(): IdentityViewModel {
  const source = useMemo<IdentitySource>(() => createLiveIdentitySource(), [])
  const [raw, setRaw] = useState<RawIdentity>(EMPTY_IDENTITY)

  useEffect(() => {
    const controller = new AbortController()
    void source.load(controller.signal).then((loaded) => {
      if (!controller.signal.aborted) setRaw(loaded)
    }).catch(() => {
      if (!controller.signal.aborted) setRaw(EMPTY_IDENTITY)
    })
    return () => { controller.abort() }
  }, [source])

  return useMemo(() => buildIdentityViewModel(raw), [raw])
}
