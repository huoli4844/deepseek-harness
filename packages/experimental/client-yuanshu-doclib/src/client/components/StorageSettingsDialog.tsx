/** NAS（外部存储）设置弹窗纯组件：展示连接状态、编辑地址与凭证并保存。 */
import type { DoclibT } from '../model.ts'
import type { StorageSettingsController } from '../use-storage.ts'
import css from '../doclib.module.css'

/** 单行输入字段。 */
function Field({ label, value, placeholder, onChange }: {
  readonly label: string
  readonly value: string
  readonly placeholder?: string
  readonly onChange: (value: string) => void
}) {
  return <label className={css.storageField}>
    <span className={css.fieldLabel}>{label}</span>
    <input className={css.storageInput} value={value} placeholder={placeholder}
      onChange={(event) => { onChange(event.target.value) }} />
  </label>
}

/** 连接状态行：健康、可读可写与延迟。 */
function HealthRow({ settings, t }: {
  readonly settings: StorageSettingsController
  readonly t: DoclibT
}) {
  const { health, checking, config } = settings
  if (checking && health === undefined) return <p className={css.healthRow}>{t('doclib.storage.checking')}</p>
  if (config !== undefined && !config.configured) return <p className={css.healthRow}>{t('doclib.storage.unconfigured')}</p>
  if (health === undefined) return <p className={css.healthRow}>{t('doclib.storage.checking')}</p>
  return <p className={css.healthRow}>
    <span className={health.healthy ? `${css.healthDot} ${css.healthDotOk}` : `${css.healthDot} ${css.healthDotBad}`} />
    <span>{health.healthy ? t('doclib.storage.healthy') : t('doclib.storage.unhealthy')}</span>
    <span className={css.healthMeta}>{health.readable ? t('doclib.storage.readable') : '—'}
      {' / '}{health.writable ? t('doclib.storage.writable') : t('doclib.storage.readonly')}</span>
    <span className={css.healthMeta}>{t('doclib.storage.latency', { ms: health.latencyMs })}</span>
    <button type="button" className={css.linkButton} disabled={checking} onClick={settings.check}>
      {t('doclib.storage.checkAgain')}</button>
  </p>
}

/**
 * NAS 设置弹窗：地址、桶、区域、HTTPS 与访问凭证；凭证留空表示沿用已有配置。
 * @param props - 设置控制器与文案。
 */
export function StorageSettingsDialog({ settings, t, onClose }: {
  readonly settings: StorageSettingsController
  readonly t: DoclibT
  readonly onClose: () => void
}) {
  const { draft, loading, saving, message, setField } = settings
  return <div className={css.dialogOverlay}>
    <section className={css.dialog} role="dialog" aria-label={t('doclib.storage.title')}>
      <header className={css.dialogHeader}>
        <h3 className={css.dialogTitle}>{t('doclib.storage.title')}</h3>
        <button type="button" className={css.closeButton} aria-label={t('doclib.detail.close')}
          onClick={onClose}>×</button>
      </header>
      {loading
        ? <p className={css.tableState}>{t('doclib.loading')}</p>
        : <div className={css.storageForm}>
          <HealthRow settings={settings} t={t} />
          <Field label={t('doclib.storage.endpoint')} value={draft.endpoint}
            placeholder="8.148.158.251:9001" onChange={(value) => { setField('endpoint', value) }} />
          <div className={css.storageRow}>
            <Field label={t('doclib.storage.bucket')} value={draft.bucket}
              onChange={(value) => { setField('bucket', value) }} />
            <Field label={t('doclib.storage.region')} value={draft.region}
              placeholder="us-east-1" onChange={(value) => { setField('region', value) }} />
          </div>
          <label className={css.storageCheck}>
            <input type="checkbox" checked={draft.useSsl}
              onChange={(event) => { setField('useSsl', event.target.checked) }} />
            <span>{t('doclib.storage.useSsl')}</span>
          </label>
          <Field label={t('doclib.storage.accessKey')} value={draft.accessKey}
            onChange={(value) => { setField('accessKey', value) }} />
          <Field label={t('doclib.storage.secretKey')} value={draft.secretKey}
            onChange={(value) => { setField('secretKey', value) }} />
          <p className={css.storageHint}>{t('doclib.storage.credentialHint')}</p>
          {message !== undefined && <p className={message === 'saved' ? css.storageSaved : css.notice} role="alert">
            {message === 'saved' ? t('doclib.storage.saved') : t('doclib.storage.saveError')}
          </p>}
        </div>}
      <footer className={css.dialogFooter}>
        <button type="button" className={css.pageButton} onClick={onClose}>{t('doclib.detail.close')}</button>
        <button type="button" className={css.primaryButton} disabled={loading || saving}
          onClick={settings.save}>{saving ? t('doclib.storage.saving') : t('doclib.storage.save')}</button>
      </footer>
    </section>
  </div>
}
