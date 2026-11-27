/** 物料分类树与分类新增表单的展示层，不读写后台。 */
import { Button, IconChevronRightOutlineRegular, Input, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { readFormText } from '../../shared/form-data.ts'
import type { MaterialCategory, MaterialCategoryDraft } from './material-model.ts'
import type { MaterialCategoryNode } from './material-viewmodel.ts'
import businessCss from './business-modules.module.css'
import css from './material-management.module.css'

interface CategoryListProps {
  readonly nodes: readonly MaterialCategoryNode[]
  readonly selectedId: number | undefined
  readonly isExpanded: (id: number) => boolean
  readonly onExpand: (id: number) => void
  readonly onSelect: (id: number | undefined) => void
  readonly t: WorkbenchT
}

function CategoryList({ nodes, selectedId, isExpanded, onExpand, onSelect, t }: CategoryListProps) {
  return <ul className={css.categoryList}>
    {nodes.map(({ category, children }) => {
      const expanded = isExpanded(category.id)
      const toggle = t(expanded ? 'material.collapseCategory' : 'material.expandCategory', { name: category.name })
      return <li key={category.id}>
        <div className={css.categoryRow}>
          {children.length > 0
            ? <Tooltip label={toggle} portal>
              <Button type="button" size="sm" variant="toolbar" className={css.categoryToggle}
                aria-label={toggle} aria-expanded={expanded} onClick={() => { onExpand(category.id) }}
                icon={<IconChevronRightOutlineRegular size={14} />} />
            </Tooltip>
            : <span className={css.categorySpacer} aria-hidden="true" />}
          <button type="button" className={css.categoryChoice} aria-pressed={selectedId === category.id}
            title={`${category.code} · ${category.name}`} onClick={() => { onSelect(category.id) }}>
            {category.name}
          </button>
        </div>
        {expanded && children.length > 0 && <div className={css.categoryChildren}>
          <CategoryList nodes={children} selectedId={selectedId} isExpanded={isExpanded} onExpand={onExpand} onSelect={onSelect} t={t} />
        </div>}
      </li>
    })}
  </ul>
}

/** 展示分类搜索、树节点和新增入口。 */
export function MaterialCategoryPanel({ status, keyword, onKeyword, onSearch, onAdd, onRetry, ...list }: CategoryListProps & {
  readonly status: 'loading' | 'ready' | 'login' | 'denied' | 'failure'
  readonly keyword: string
  readonly onKeyword: (value: string) => void
  readonly onSearch: () => void
  readonly onAdd: () => void
  readonly onRetry: () => void
}) {
  const { t, nodes, selectedId, onSelect } = list
  return <section className={css.categories} aria-label={t('material.categories')}>
    <div className={css.categoryHeader}>
      <h2>{t('material.categories')}</h2>
      <Button type="button" size="sm" variant="outline" disabled={status !== 'ready'} onClick={onAdd}>{t('material.addCategory')}</Button>
    </div>
    <form className={css.categorySearch} onSubmit={(event) => {
      event.preventDefault()
      onSearch()
    }}>
      <Input name="keyword" maxLength={100} value={keyword} onChange={(event) => { onKeyword(event.target.value) }}
        aria-label={t('material.categoryKeyword')} placeholder={t('material.categoryKeyword')} />
      <Button type="submit" size="sm" variant="outline">{t('material.categorySearch')}</Button>
    </form>
    <div className={css.categoryBody} aria-busy={status === 'loading'}>
      {status === 'loading' && <p role="status">{t('material.categoryLoading')}</p>}
      {status !== 'loading' && status !== 'ready' && <div role="alert">
        <p>{t(status === 'login' ? 'material.login' : status === 'denied' ? 'material.denied' : 'material.categoryError')}</p>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t('material.retry')}</Button>
      </div>}
      {status === 'ready' && <>
        <button type="button" className={css.categoryChoice} aria-pressed={selectedId === undefined} onClick={() => { onSelect(undefined) }}>
          {t('material.allCategories')}
        </button>
        {nodes.length > 0 ? <CategoryList {...list} /> : <p role="status">{t('material.categoryEmpty')}</p>}
      </>}
    </div>
  </section>
}

/** 展示新增分类弹窗，父级可使用当前选中分类或顶级分类。 */
export function MaterialCategoryDialog({ parent, pending, error, onClose, onSave, t }: {
  readonly parent: MaterialCategory | undefined
  readonly pending: boolean
  readonly error: string | undefined
  readonly onClose: () => void
  readonly onSave: (draft: MaterialCategoryDraft) => void
  readonly t: WorkbenchT
}) {
  const formId = 'workbench-material-category-create'
  return <Modal open title={t('material.addCategory')} closeLabel={t('material.cancel')} onClose={onClose}
    footer={<>
      <Button type="submit" form={formId} variant="primary" disabled={pending}>{t('material.save')}</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t('material.cancel')}</Button>
    </>}>
    <form id={formId} className={businessCss.businessModuleFormGrid} onSubmit={(event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      onSave({
        code: readFormText(data, 'code'), name: readFormText(data, 'name'),
        description: readFormText(data, 'description'),
        parentId: parent !== undefined && data.get('parent') === String(parent.id) ? parent.id : undefined,
      })
    }}>
      <label className={businessCss.businessModuleSelect}>{t('material.categoryCode')}
        <Input name="code" required maxLength={50} disabled={pending} />
      </label>
      <label className={businessCss.businessModuleSelect}>{t('material.categoryName')}
        <Input name="name" required maxLength={100} disabled={pending} />
      </label>
      <label className={businessCss.businessModuleSelect}>{t('material.categoryParent')}
        <select name="parent" defaultValue={parent?.id ?? ''} disabled={pending}>
          <option value="">{t('material.rootCategory')}</option>
          {parent !== undefined && <option value={parent.id}>{parent.name}</option>}
        </select>
      </label>
      <label className={businessCss.businessModuleSelect}>{t('material.categoryDescription')}
        <Input name="description" maxLength={4000} disabled={pending} />
      </label>
    </form>
    {error !== undefined && <p className={businessCss.businessModuleFormError} role="alert">{error}</p>}
  </Modal>
}
