/** 编排项目搜索和选择，复用同源项目目录。 */
import { useEffect, useState } from 'react'
import { Button, IconSearchOutlineRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { readFormText } from '../../shared/form-data.ts'
import { listRegistrationProjects } from './project-registration-api.ts'
import type { RegistrationPage, RegistrationProject } from './project-registration-model.ts'
import { projectChoices } from './project-registration-viewmodel.ts'
import css from './project-registration.module.css'

/** 呈现可搜索和分页的项目选择；紧凑模式把搜索框收进同一行。 */
export function RegistrationProjectPicker({ selected, onSelect, disabled, t, compact = false, initialSelection = false }: {
  readonly selected: RegistrationProject | undefined
  readonly onSelect: (project: RegistrationProject | undefined) => void
  readonly disabled: boolean
  readonly t: WorkbenchT
  readonly compact?: boolean
  readonly initialSelection?: boolean
}) {
  const [query, setQuery] = useState({ keyword: '', page: 1 })
  const [result, setResult] = useState<RegistrationPage<RegistrationProject>>()
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    void listRegistrationProjects(query.keyword, query.page, controller.signal).then((value) => {
      if (controller.signal.aborted) return
      setResult(value)
      setStatus('ready')
    }).catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => { controller.abort() }
  }, [query])
  const choices = projectChoices(result?.items ?? [], selected)
  useEffect(() => {
    if (initialSelection && !selected && result?.items[0]) onSelect(result.items[0])
  }, [initialSelection, onSelect, result, selected])
  const search = <form className={css.inline} onSubmit={(event) => {
    event.preventDefault()
    setQuery({ keyword: readFormText(new FormData(event.currentTarget), 'keyword').trim(), page: 1 })
  }}>
    <Input name="keyword" maxLength={100} aria-label={t('registration.findProject')} placeholder={t('registration.findProject')} />
    <Button type="submit" size={compact ? 'sm' : 'md'} variant="outline" aria-label={t('registration.search')} icon={<IconSearchOutlineRegular />} />
  </form>
  const select = <select aria-label={compact ? t('weekly.projectScope') : t('registration.project')} disabled={disabled} value={selected?.code ?? ''} onChange={(event) => {
    onSelect(choices.find(item => item.code === event.target.value))
  }}>
    <option value="">{t('registration.selectProject')}</option>
    {choices.map(item => <option key={item.code} value={item.code}>{item.code} {item.name}</option>)}
  </select>
  const statuses = <>
    {status === 'loading' && <span role="status">{t('registration.loading')}</span>}
    {status === 'ready' && result?.items.length === 0 && <span role="status">{t('registration.noProjects')}</span>}
    {status === 'error' && <div role="alert" className={css.inline}>
      <span>{t('registration.loadError')}</span>
      <Button variant="outline" onClick={() => { setQuery({ ...query }) }}>{t('registration.retry')}</Button>
    </div>}
    {result !== undefined && result.total > result.pageSize && <div className={css.inline}>
      <Button variant="outline" size="sm" disabled={status === 'loading' || query.page <= 1}
        onClick={() => { setQuery({ ...query, page: query.page - 1 }) }}>{t('registration.previousProjects')}</Button>
      <Button variant="outline" size="sm" disabled={status === 'loading' || query.page * result.pageSize >= result.total}
        onClick={() => { setQuery({ ...query, page: query.page + 1 }) }}>{t('registration.nextProjects')}</Button>
    </div>}
  </>
  if (compact) return <div className={css.pickerCompact}>
    <label className={css.pickerCompactField}><span>{t('weekly.projectScope')}</span>{select}</label>
    {search}
    {statuses}
  </div>
  return <div className={css.picker}>
    {search}
    <label className={css.field}>{t('registration.project')}{select}</label>
    {statuses}
  </div>
}
