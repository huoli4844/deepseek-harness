/** Browser title selection follows the active main panel without subscribing the frame. */
import { useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Event used by shell occupants (e.g. OEM branding) to override the build product title. */
export const PRODUCT_TITLE_EVENT = 'dsh-product-title'

/** Props for the browser title projection. */
export type DocumentTitleProps = Pick<PropsRuntime<'root'>, 'useSessions' | 'usePanelInfo'> & {
  /** Build-configured or localized product title. */
  productTitle: string
}

/**
 * Project the selected durable session title into the browser title and
 * restore the build-selected product title when unmounted. An occupant may
 * dispatch `dsh-product-title` (CustomEvent with a string detail, or empty to
 * reset) to replace the build-selected product title at runtime.
 * @param props - Selected session title projection.
 * @returns No rendered content.
 */
export function DocumentTitle({ useSessions, usePanelInfo, productTitle }: DocumentTitleProps): null {
  const showSessionTitle = usePanelInfo(info => info.activePanelId === null)
  const title = useSessions((state) => {
    const current = Object.values(state.byId)
      .find(session => (session.retainedBy.mainView ?? 0) > 0)?.id
    return !showSessionTitle || current === undefined ? undefined : state.byId[current]?.title
  })
  const [override, setOverride] = useState<string | null>(null)
  useEffect(() => {
    const onOverride = (event: Event): void => {
      setOverride(event instanceof CustomEvent && typeof event.detail === 'string' && event.detail !== '' ? event.detail : null)
    }
    window.addEventListener(PRODUCT_TITLE_EVENT, onOverride)
    return () => { window.removeEventListener(PRODUCT_TITLE_EVENT, onOverride) }
  }, [])
  const resolved = override ?? productTitle
  useEffect(() => {
    document.title = title === undefined ? resolved : `${title} — ${resolved}`
    return () => { document.title = resolved }
  }, [resolved, title])
  return null
}
