/** YuanShu OEM branding, fetched through the same-origin workbench proxy. */
import { useEffect, useState } from 'react'

/** Resolved OEM brand identity. */
export interface OemBrand {
  /** Backend system name (first brand line). */
  systemName: string
  /** Single-line document title: system name plus the workbench label. */
  title: string
  /** Same-origin proxy URL for the platform icon. */
  iconUrl: string
}

/** Workbench label shown as the second brand line. */
const WORKBENCH_LABEL = '智能工作台'

/** Same-origin proxy routes exposed by the yuanshu-workbench host plugin. */
const OEM_CONFIG_PATH = '/yuanshu-workbench/oem-configs'
const OEM_ICON_PATH = '/yuanshu-workbench/oem-configs/icon'

/** Document-title override event consumed by ui-layout's DocumentTitle. */
export const PRODUCT_TITLE_EVENT = 'dsh-product-title'

let cached: Promise<OemBrand | null> | undefined

/**
 * Fetch (and memoize) the OEM brand identity; resolves null when the proxy or
 * the backend is unavailable, so the shell keeps its built-in branding.
 */
export function loadOemBrand(): Promise<OemBrand | null> {
  cached ??= fetch(OEM_CONFIG_PATH, { headers: { accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) return null
      const body: unknown = await response.json()
      if (typeof body !== 'object' || body === null) return null
      const systemName = (body as Record<string, unknown>)['system_name']
      return typeof systemName === 'string' && systemName !== ''
        ? { systemName, title: `${systemName} ${WORKBENCH_LABEL}`, iconUrl: OEM_ICON_PATH }
        : null
    })
    .catch(() => null)
  return cached
}

/**
 * Sidebar brand-mark occupant: the platform icon served through the proxy.
 * Renders nothing while the image is unavailable.
 */
export function OemBrandMark({ size }: { size: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      src={OEM_ICON_PATH}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{ borderRadius: '25%', display: 'block' }}
      onError={() => { setFailed(true) }}
    />
  )
}

/**
 * Sidebar brand-name occupant: the backend system name on the first line and
 * the workbench label beneath it; falls back to the localized shell title
 * while unavailable.
 */
export function OemBrandName() {
  const [brand, setBrand] = useState<OemBrand | null>(null)
  useEffect(() => {
    let live = true
    void loadOemBrand().then((resolved) => {
      if (live) setBrand(resolved)
    })
    return () => { live = false }
  }, [])
  if (brand === null) {
    return <span style={{ fontSize: '15px', letterSpacing: 0, whiteSpace: 'nowrap' }}>元枢智能工作台</span>
  }
  return (
    <span style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: '14px', fontWeight: 600, lineHeight: '15px' }}>{brand.systemName}</span>
      <span style={{ fontSize: '14px', fontWeight: 600, lineHeight: '15px', opacity: 0.78 }}>
        {WORKBENCH_LABEL}
      </span>
    </span>
  )
}
