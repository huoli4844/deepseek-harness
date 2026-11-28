/** 创建个人页：填写不超过 10 个字符的名称，自由组装数据卡片，预览确认后发布。复用工作台固定编辑弹窗。 */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, IconPlusOutlineRegular, IconTrashOutlineRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { EDIT_TEMPLATE } from '../../../business-forms/templates/index.ts'
import type { WorkbenchT } from '../../app/page-api.ts'
import { fetchOrganizationMembers } from '../business-modules/organization-api.ts'
import { BusinessFormModal } from '../../shared/BusinessFormModal.tsx'
import type { PersonalPage, PersonalWidget } from './model.ts'
import { renderPersonalWidget, WIDGET_LABELS } from './personal-widgets.tsx'
import css from './personal-pages.module.css'

/** 页面名称上限，超出部分直接不可输入。 */
const nameMaxLength = 10

/** 合法卡片类型集合，用于过滤对话预填的未知类型。 */
const WIDGET_TYPES = ['labor-month', 'member-labor', 'headcount', 'data-query'] as const

/** 页面内容选项：类型联合扩展后自动出现；data-query 由对话预填，不提供手动添加。 */
const widgetTypes = (Object.keys(WIDGET_LABELS) as readonly PersonalWidget['type'][]).filter(type => type !== 'data-query')

/** 卡片是否已配置完成；未配置的卡不能预览和发布。 */
function widgetReady(widget: PersonalWidget): boolean {
  if (widget.type === 'member-labor') return typeof widget.memberId === 'number'
  if (widget.type === 'data-query') return typeof widget.path === 'string' && widget.path !== ''
  return true
}

/** member-labor 卡的成员选择下拉；选中后写入卡片配置。 */
function MemberPicker({ widget, widgets, setWidgets, t }: {
  readonly widget: PersonalWidget
  readonly widgets: readonly PersonalWidget[]
  readonly setWidgets: (next: readonly PersonalWidget[]) => void
  readonly t: WorkbenchT
}) {
  const [members, setMembers] = useState<readonly { readonly id: number; readonly nickname: string }[]>()
  useEffect(() => {
    const controller = new AbortController()
    void fetchOrganizationMembers({ departmentId: undefined, keyword: '', page: 1, pageSize: 100 }, controller.signal).then((data) => {
      if (!controller.signal.aborted) setMembers(data.list.map(item => ({ id: item.id, nickname: item.nickname })))
    }).catch(() => {
      if (!controller.signal.aborted) setMembers([])
    })
    return () => { controller.abort() }
  }, [])
  return <select aria-label={t('personalPages.pickMember')} value={widget.memberId ?? ''}
    onChange={(event) => {
      const id = Number(event.target.value)
      if (!id) return
      const name = members?.find(item => item.id === id)?.nickname ?? ''
      setWidgets(widgets.map(item => item.id === widget.id
        ? { ...item, memberId: id, ...(name === '' ? {} : { memberName: name }) } : item))
    }}>
    <option value="">{t('personalPages.pickMember')}</option>
    {members?.map(item => <option key={item.id} value={item.id}>{item.nickname}</option>)}
  </select>
}

/** 预览中的单张卡片：用固定身份的 onReady 回调，避免卡片组件因依赖变化反复重新查询。 */
function PreviewCard({ widget, userId, t, onCardReady }: {
  readonly widget: PersonalWidget
  readonly userId: number
  readonly t: WorkbenchT
  readonly onCardReady: (id: string, done: boolean) => void
}) {
  const onReady = useCallback((done: boolean) => { onCardReady(widget.id, done) }, [onCardReady, widget.id])
  return <section>{renderPersonalWidget(widget, userId, t, onReady)}</section>
}

/** 发布前显示员工亲自确认的切换按钮名称和实时预览；对话预填时自动进入构建预览。 */
export function PersonalPageEditor({ t, userId, initialName, initialWidgets, autoPreview, onClose, onPublish }: {
  readonly t: WorkbenchT
  readonly userId: number
  readonly initialName: string
  /** 创建对话预填的卡片；普通入口不传，从空白开始组装。 */
  readonly initialWidgets?: readonly PersonalWidget[]
  /** 预填卡片来自对话时为 true：弹窗直接进入构建预览，全部卡片数据就绪后即可发布。 */
  readonly autoPreview?: boolean
  readonly onClose: () => void
  readonly onPublish: (page: PersonalPage) => Promise<'duplicate' | 'storageError' | undefined>
}) {
  const [name, setName] = useState(initialName)
  // 对话预填的卡片可能缺 id（工具参数不含 id）：入库前必须补齐，否则读取校验会整页丢弃。
  const draftWidgets = useMemo(() => (initialWidgets ?? [])
    .filter(widget => (WIDGET_TYPES as readonly string[]).includes(widget.type))
    .map(widget => ({ ...widget, id: typeof widget.id === 'string' && widget.id !== '' ? widget.id : randomUUID() })),
  [initialWidgets])
  const [widgets, setWidgets] = useState<readonly PersonalWidget[]>(draftWidgets)
  const autoDraft = autoPreview === true && draftWidgets.length > 0
  const [preview, setPreview] = useState<PersonalPage | undefined>(() => autoDraft
    ? { id: randomUUID(), name: initialName.trim(), widgets: draftWidgets } : undefined)
  /** 各卡片的数据就绪状态；构建进度条按此计数。 */
  const [readyMap, setReadyMap] = useState<Readonly<Record<string, boolean>>>({})
  const onCardReady = useCallback((id: string, done: boolean) => {
    setReadyMap(previous => ({ ...previous, [id]: done }))
  }, [])
  const ready = preview !== undefined && preview.widgets.length > 0
    && preview.widgets.every(widget => readyMap[widget.id] === true)
  const loaded = preview?.widgets.filter(widget => readyMap[widget.id] === true).length ?? 0
  const [error, setError] = useState<'duplicate' | 'storageError'>()
  return <BusinessFormModal open title={t('personalPages.add')} closeLabel={t('equipment.cancel')}
    onClose={onClose} maxWidth={EDIT_TEMPLATE.maxWidth} footer={<div className={css.actions}>
      <Button onClick={onClose}>{t('equipment.cancel')}</Button>
      {preview ? <>
        <Button onClick={() => { setPreview(undefined); setError(undefined) }}>{t('personalPages.back')}</Button>
        <Button variant="primary" disabled={!ready} onClick={() => {
          void onPublish(preview).then(setError).catch(() => { setError('storageError') })
        }}>{t('personalPages.publish')}</Button>
      </> : <Button variant="primary" disabled={!name.trim() || widgets.length === 0 || !widgets.every(widgetReady)} onClick={() => {
        setReadyMap({})
        setPreview({ id: randomUUID(), name: name.trim(), widgets })
      }}>{t('personalPages.preview')}</Button>}
    </div>}>
    {error && <p role="alert">{t(`personalPages.${error}`)}</p>}
    {preview ? <>
      <p>{t('personalPages.confirmName')} <strong>{preview.name}</strong></p>
      {!ready && <div className={css.building} role="status" aria-live="polite">
        <span>{t('personalPages.building', { loaded: loaded, total: preview.widgets.length })}</span>
        <div className={css.buildingBar} />
      </div>}
      {preview.widgets.map(widget => <PreviewCard key={widget.id} widget={widget} userId={userId} t={t} onCardReady={onCardReady} />)}
    </> : <div className={css.fields}>
      <label>{t('personalPages.name')}<Input autoFocus maxLength={nameMaxLength} value={name}
        onChange={(event) => { setName(event.target.value) }} /></label>
      <div className={css.fields}>
        <p>{t('personalPages.widgets')}</p>
        {widgets.map(widget => <div key={widget.id} className={css.widgetRow}>
          <span>{widget.type === 'member-labor' && widget.memberName !== undefined
            ? `${t(WIDGET_LABELS[widget.type])} · ${widget.memberName}`
            : widget.type === 'data-query' && widget.title !== undefined && widget.title !== ''
              ? `${t(WIDGET_LABELS[widget.type])} · ${widget.title}`
              : t(WIDGET_LABELS[widget.type])}</span>
          {widget.type === 'member-labor' && <MemberPicker widget={widget} widgets={widgets} setWidgets={setWidgets} t={t} />}
          <Button size="sm" variant="outline" icon={<IconTrashOutlineRegular size={14} />}
            aria-label={t('personalPages.removeWidget')} onClick={() => {
              setWidgets(previous => previous.filter(item => item.id !== widget.id))
            }} />
        </div>)}
        {widgetTypes.map(type => <Button key={type} size="sm" variant="outline"
          icon={<IconPlusOutlineRegular size={14} />} onClick={() => {
            setWidgets(previous => [...previous, { id: randomUUID(), type }])
          }}>{t(WIDGET_LABELS[type])}</Button>)}
      </div>
    </div>}
  </BusinessFormModal>
}
