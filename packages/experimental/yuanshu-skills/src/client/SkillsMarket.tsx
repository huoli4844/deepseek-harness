/** 技能市场主面板：分页签列表、安装来源、导入包与导出下载。 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  downloadPackage, fetchSection, importPackage, installFromSource, requestErrorKind,
  type SkillItem, type SkillsSection,
} from './skills-store.ts'
import css from './skills.module.css'

const SECTIONS: readonly SkillsSection[] = ['skills', 'sources', 'packages']

/** 请求超时：列表读取与写操作使用同一预算。 */
const REQUEST_TIMEOUT_MS = 60_000

/**
 * 渲染技能市场：浏览元枢技能、安装来源、导入技能包并导出下载。
 * @param props - 本地化文案。
 * @returns 技能市场主面板。
 */
export function SkillsMarket(props: PropsLocale<'yuanshu.skills'>) {
  const { t } = props
  const [section, setSection] = useState<SkillsSection>('skills')
  const [items, setItems] = useState<readonly SkillItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'login' | 'failed' | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [dialog, setDialog] = useState<'install' | 'import' | undefined>(undefined)
  const [detail, setDetail] = useState<SkillItem | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState('')
  const [ref, setRef] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flash = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => { setNotice(undefined) }, 2_600)
  }, [])

  const load = useCallback(async (target: SkillsSection) => {
    const current = ++generation.current
    setLoading(true)
    setError(undefined)
    try {
      const rows = await fetchSection(target, AbortSignal.timeout(REQUEST_TIMEOUT_MS))
      if (generation.current === current) setItems(rows)
    } catch (cause) {
      if (generation.current === current) setError(requestErrorKind(cause))
    } finally {
      if (generation.current === current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(section)
    return () => { generation.current += 1 }
  }, [section, load])
  useEffect(() => () => {
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current)
  }, [])

  const run = async (operation: () => Promise<void>, success: string) => {
    setBusy(true)
    try {
      await operation()
      setDialog(undefined)
      flash(success)
      await load(section)
    } catch (cause) {
      flash(t(requestErrorKind(cause) === 'login' ? 'skills.login' : 'skills.failed'))
    } finally {
      setBusy(false)
    }
  }

  const download = async (item: SkillItem) => {
    try {
      const { blob, name } = await downloadPackage(item.id, AbortSignal.timeout(REQUEST_TIMEOUT_MS))
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (cause) {
      flash(t(requestErrorKind(cause) === 'login' ? 'skills.login' : 'skills.failed'))
    }
  }

  const submitInstall = () => {
    const address = source.trim()
    if (address === '') return
    void run(() => installFromSource(address, ref.trim(), AbortSignal.timeout(REQUEST_TIMEOUT_MS)), t('skills.installDone'))
  }

  const submitImport = (file: File | undefined) => {
    if (file === undefined) return
    void run(() => importPackage(file, AbortSignal.timeout(REQUEST_TIMEOUT_MS)), t('skills.importDone'))
  }

  return <div className={css.shell}>
    <header className={css.head}>
      <div>
        <h1 className={css.title}>{t('skills.title')}</h1>
        <p className={css.subtitle}>{t('skills.subtitle')}</p>
      </div>
      <div className={css.actions}>
        <Button onClick={() => { void load(section) }} disabled={loading}>{t('skills.refresh')}</Button>
        <Button onClick={() => { setSource(''); setRef(''); setDialog('install') }}>{t('skills.install')}</Button>
        <Button onClick={() => { setDialog('import') }}>{t('skills.import')}</Button>
      </div>
    </header>

    <nav className={css.tabs} aria-label={t('skills.title')}>
      {SECTIONS.map(item => <button key={item} type="button"
        className={item === section ? css.tabActive : css.tab}
        aria-current={item === section ? 'page' : undefined}
        onClick={() => { setSection(item) }}>
        {t(`skills.tab.${item}`)}
      </button>)}
      <span className={css.count}>{t('skills.count', { count: items.length })}</span>
    </nav>

    <section className={css.body}>
      {loading && <p className={css.state}>{t('skills.loading')}</p>}
      {!loading && error !== undefined && <p className={css.state}>
        {t(error === 'login' ? 'skills.login' : 'skills.failed')}
        <button type="button" className={css.link} onClick={() => { void load(section) }}>{t('skills.retry')}</button>
      </p>}
      {!loading && error === undefined && items.length === 0 && <p className={css.state}>{t('skills.empty')}</p>}
      {!loading && error === undefined && items.length > 0 && <table className={css.table}>
        <thead>
          <tr>
            <th>{t('skills.col.name')}</th>
            <th className={css.narrow}>{t('skills.col.version')}</th>
            <th className={css.narrow}>{t('skills.col.status')}</th>
            <th className={css.narrow}>{t('skills.col.updated')}</th>
            <th className={css.narrow} aria-label={t('skills.detail')} />
          </tr>
        </thead>
        <tbody>
          {items.map(item => <tr key={`${item.id}:${item.name}`}>
            <td>
              <button type="button" className={css.nameButton} onClick={() => { setDetail(item) }}>
                {item.name === '' ? item.id : item.name}
              </button>
              {item.description === '' ? null : <p className={css.description}>{item.description}</p>}
            </td>
            <td className={css.narrow}>{item.version === '' ? '—' : item.version}</td>
            <td className={css.narrow}>{item.status === '' ? '—' : item.status}</td>
            <td className={css.narrow}>{item.updatedAt === '' ? '—' : item.updatedAt}</td>
            <td className={css.narrow}>
              <Button onClick={() => { void download(item) }}>{t('skills.download')}</Button>
            </td>
          </tr>)}
        </tbody>
      </table>}
    </section>

    <input ref={fileInput} type="file" hidden aria-hidden="true"
      onChange={(event) => {
        submitImport(event.target.files?.[0])
        event.target.value = ''
      }} />

    {dialog === 'install' && <Modal open closeLabel={t('skills.close')} title={t('skills.install')}
      onClose={() => { if (!busy) setDialog(undefined) }}
      footer={<>
        <Button onClick={() => { setDialog(undefined) }} disabled={busy}>{t('skills.cancel')}</Button>
        <Button onClick={submitInstall} disabled={busy || source.trim() === ''}>
          {busy ? t('skills.installing') : t('skills.submit')}
        </Button>
      </>}>
      <label className={css.field}>
        <span>{t('skills.source.url')}</span>
        <Input value={source} onChange={(event) => { setSource(event.target.value) }} disabled={busy} />
      </label>
      <label className={css.field}>
        <span>{t('skills.source.ref')}</span>
        <Input value={ref} onChange={(event) => { setRef(event.target.value) }} disabled={busy} />
      </label>
    </Modal>}

    {dialog === 'import' && <Modal open closeLabel={t('skills.close')} title={t('skills.import')}
      onClose={() => { if (!busy) setDialog(undefined) }}
      footer={<>
        <Button onClick={() => { setDialog(undefined) }} disabled={busy}>{t('skills.cancel')}</Button>
        <Button onClick={() => { fileInput.current?.click() }} disabled={busy}>
          {busy ? t('skills.importing') : t('skills.upload')}
        </Button>
      </>}>
      <p className={css.fieldText}>{t('skills.file')}</p>
    </Modal>}

    {detail !== undefined && <Modal open closeLabel={t('skills.close')} title={detail.name === '' ? detail.id : detail.name}
      onClose={() => { setDetail(undefined) }}
      maxWidth={720}
      footer={<Button onClick={() => { setDetail(undefined) }}>{t('skills.close')}</Button>}>
      <p className={css.fieldText}>{t('skills.raw')}</p>
      <pre className={css.raw}>{JSON.stringify(detail.raw, null, 2)}</pre>
      <Button onClick={() => { void download(detail) }}>{t('skills.download')}</Button>
    </Modal>}

    {notice !== undefined && <div className={css.toast} role="status">{notice}</div>}
  </div>
}
