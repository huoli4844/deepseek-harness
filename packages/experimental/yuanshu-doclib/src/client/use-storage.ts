/** NAS（外部存储）设置状态：读取当前配置与健康状态，提交保存，不依赖渲染。 */
import { useCallback, useEffect, useState } from 'react'
import type { StorageConfig, StorageDraft, StorageHealth } from './model.ts'
import { fetchStorageConfig, fetchStorageHealth, saveStorageConfig } from './source.ts'

/** NAS 设置的全部状态与动作。 */
export interface StorageSettingsController {
  readonly config: StorageConfig | undefined
  readonly health: StorageHealth | undefined
  readonly draft: StorageDraft
  readonly loading: boolean
  readonly checking: boolean
  readonly saving: boolean
  readonly message: 'saved' | 'error' | undefined
  readonly setField: (field: keyof StorageDraft, value: string | boolean) => void
  readonly check: () => void
  readonly save: () => void
}

/** 空草稿：用于配置尚未加载时的表单占位。 */
const EMPTY_DRAFT: StorageDraft = {
  endpoint: '', bucket: '', region: '', useSsl: false, accessKey: '', secretKey: '',
}

/** 由服务端配置生成编辑草稿；凭证永不由服务端回显，始终保持为空。 */
function draftFrom(config: StorageConfig): StorageDraft {
  return {
    endpoint: config.endpoint,
    bucket: config.bucket,
    region: config.region,
    useSsl: config.useSsl,
    accessKey: '',
    secretKey: '',
  }
}

/** 读取、检测并保存 NAS 配置；组件打开时挂载，关闭即卸载。 */
export function useStorageSettings(): StorageSettingsController {
  const [config, setConfig] = useState<StorageConfig | undefined>(undefined)
  const [health, setHealth] = useState<StorageHealth | undefined>(undefined)
  const [draft, setDraft] = useState<StorageDraft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<'saved' | 'error' | undefined>(undefined)

  useEffect(() => {
    const controller = new AbortController()
    fetchStorageConfig(controller.signal).then((value) => {
      if (controller.signal.aborted) return
      setConfig(value)
      setDraft(draftFrom(value))
      setLoading(false)
    }).catch(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => { controller.abort() }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setChecking(true)
    fetchStorageHealth(controller.signal).then((value) => {
      if (controller.signal.aborted) return
      setHealth(value)
      setChecking(false)
    }).catch(() => {
      if (!controller.signal.aborted) setChecking(false)
    })
    return () => { controller.abort() }
  }, [])

  const check = useCallback(() => {
    setChecking(true)
    fetchStorageHealth(AbortSignal.timeout(15_000)).then((value) => {
      setHealth(value)
      setChecking(false)
    }).catch(() => { setChecking(false) })
  }, [])

  const save = useCallback(() => {
    setSaving(true)
    setMessage(undefined)
    saveStorageConfig(draft, AbortSignal.timeout(20_000)).then(() => {
      setSaving(false)
      setMessage('saved')
      return fetchStorageConfig(AbortSignal.timeout(15_000))
    }).then((value) => {
      setConfig(value)
      setDraft(current => ({ ...current, endpoint: value.endpoint, bucket: value.bucket, region: value.region, useSsl: value.useSsl }))
      check()
    }).catch(() => {
      setSaving(false)
      setMessage('error')
    })
  }, [draft, check])

  return {
    config,
    health,
    draft,
    loading,
    checking,
    saving,
    message,
    setField: (field, value) => {
      setMessage(undefined)
      setDraft(current => ({ ...current, [field]: value }))
    },
    check,
    save,
  }
}
