/** 个人页数据卡片注册表：类型与渲染器在此登记，页面框架不限定可展示的数据视图。 */
import type { ReactNode } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { PersonalWidget } from './model.ts'
import { DataQueryCard } from './DataQueryCard.tsx'
import { PersonalHeadcount } from './PersonalHeadcount.tsx'
import { PersonalLabor } from './PersonalLabor.tsx'

/** 卡片类型到编辑器选项文案；新增数据视图时在类型联合与本表各加一项。 */
export const WIDGET_LABELS: Readonly<Record<PersonalWidget['type'], Parameters<WorkbenchT>[0]>> = {
  'labor-month': 'personalPages.kindLabor',
  'member-labor': 'personalPages.kindMember',
  headcount: 'personalPages.kindHeadcount',
  'data-query': 'personalPages.kindDataQuery',
}

/** 渲染一张数据卡片；onReady 用于预览流程确认数据已加载完成。 */
export function renderPersonalWidget(widget: PersonalWidget, userId: number, t: WorkbenchT, onReady?: (ready: boolean) => void): ReactNode {
  switch (widget.type) {
    case 'headcount':
      return <PersonalHeadcount t={t} onReady={onReady} />
    case 'member-labor':
      return widget.memberId === undefined
        ? <p role="status">{t('personalPages.pickMember')}</p>
        : <PersonalLabor period={widget.period ?? 'month'} userId={widget.memberId} t={t} onReady={onReady} />
    case 'labor-month':
      return <PersonalLabor period={widget.period ?? 'month'} userId={userId} t={t} onReady={onReady} />
    case 'data-query':
      return <DataQueryCard widget={widget} t={t} onReady={onReady} />
  }
}
