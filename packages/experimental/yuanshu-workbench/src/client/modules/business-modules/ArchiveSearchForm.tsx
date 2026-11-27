/** 渲染客户和供应商的组合筛选表单，不请求档案或分类。 */
import { Button, IconSearchOutlineRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { RecordListFilters } from './record-list-query.ts'
import css from './business-modules.module.css'

/** 渲染两个档案页共用的结构化筛选控件。 */
export function ArchiveSearchForm({ resource, t, categories, categoryFailed, retryCategories, ready, onSearch, onCreate }: {
  readonly resource: 'customer' | 'supplier'
  readonly t: WorkbenchT
  readonly categories?: readonly string[] | undefined
  readonly categoryFailed?: boolean
  readonly retryCategories?: () => void
  readonly ready: boolean
  readonly onSearch: (filters: RecordListFilters) => void
  readonly onCreate: () => void
}) {
  return <form className={css.archiveSearch} aria-label={t(`${resource}.search`)} onSubmit={(event) => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const get = (key: string) => {
      const value = fields.get(key)
      return typeof value === 'string' ? value.trim() : ''
    }
    onSearch({ code: get('code'), name: get('name'), contactPerson: get('contactPerson'), category: get('category') })
  }}>
    <div className={css.archiveSearchFields}>
      <label className={css.businessModuleSelect}>
        {t(`${resource}.code`)}
        <Input name="code" maxLength={100} />
      </label>
      <label className={css.businessModuleSelect}>
        {t(`${resource}.name`)}
        <Input name="name" maxLength={100} />
      </label>
      {resource === 'supplier' && <label className={css.businessModuleSelect}>
        {t('supplier.category')}
        <select name="category" disabled={categories === undefined}>
          <option value="">{t('supplier.allCategories')}</option>
          {categories?.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>}
      <label className={css.businessModuleSelect}>
        {t(`${resource}.contactPerson`)}
        <Input name="contactPerson" maxLength={100} />
      </label>
    </div>
    <div className={css.businessModuleActions}>
      <Button type="submit" variant="primary" aria-label={t('record.search')} icon={<IconSearchOutlineRegular />} />
      <Button type="button" variant="outline" disabled={!ready} onClick={onCreate}>{t(`${resource}.add`)}</Button>
    </div>
    {categoryFailed && <p className={css.archiveFilterError} role="alert">
      {t('supplier.categoryLoadFailed')}
      <Button type="button" size="sm" variant="outline" onClick={retryCategories}>{t('supplier.retry')}</Button>
    </p>}
  </form>
}
