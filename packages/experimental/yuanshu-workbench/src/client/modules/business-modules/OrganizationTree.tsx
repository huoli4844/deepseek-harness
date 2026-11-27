/** 部门层级树：默认展开全部节点，点击部门名切换右侧成员列表。 */
import { useState } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { DepartmentNode } from './organization-model.ts'
import css from './organization.module.css'

interface BranchProps {
  readonly nodes: readonly DepartmentNode[]
  readonly depth: number
  readonly collapsed: ReadonlySet<number>
  readonly selected: number | undefined
  readonly t: WorkbenchT
  readonly onToggle: (id: number) => void
  readonly onSelect: (id: number) => void
}

function TreeBranch({ nodes, depth, collapsed, selected, t, onToggle, onSelect }: BranchProps) {
  return <ul className={depth === 0 ? css.tree : css.treeGroup} role={depth === 0 ? 'tree' : 'group'}>
    {nodes.map((node) => {
      const hasChildren = node.children.length > 0
      const isCollapsed = collapsed.has(node.id)
      return <li key={node.id} role="treeitem" aria-expanded={hasChildren ? !isCollapsed : undefined}
        aria-selected={selected === node.id}>
        <div className={selected === node.id ? `${css.treeRow} ${css.treeRowActive}` : css.treeRow}
          style={{ paddingInlineStart: `${depth * 14 + 6}px` }}>
          {hasChildren
            ? <button type="button" className={css.treeToggle}
              aria-label={`${isCollapsed ? t('organization.expand') : t('organization.collapse')} ${node.name}`}
              onClick={() => { onToggle(node.id) }}>{isCollapsed ? '▸' : '▾'}</button>
            : <span className={css.treeLeaf} aria-hidden="true">·</span>}
          <button type="button" className={css.treeLabel} title={node.name}
            onClick={() => { onSelect(node.id) }}>{node.name}</button>
          <span className={css.treeCount} title={t('organization.memberTotal')}>{node.totalMembers}</span>
        </div>
        {hasChildren && !isCollapsed && <TreeBranch nodes={node.children} depth={depth + 1}
          collapsed={collapsed} selected={selected} t={t} onToggle={onToggle} onSelect={onSelect} />}
      </li>
    })}
  </ul>
}

/** 渲染整棵部门树，展开状态保存在组件内。 */
export function OrganizationTree({ nodes, selected, t, onSelect }: {
  readonly nodes: readonly DepartmentNode[]
  readonly selected: number | undefined
  readonly t: WorkbenchT
  readonly onSelect: (id: number) => void
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set())
  const toggle = (id: number): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return <TreeBranch nodes={nodes} depth={0} collapsed={collapsed} selected={selected}
    t={t} onToggle={toggle} onSelect={onSelect} />
}
