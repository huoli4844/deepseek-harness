/**
 * 文件与资料 — 左侧目录树 + 右侧文件预览。
 *
 * 目录结构对齐元枢后台的项目文件组织方式（项目文件夹导入的 object_key 层级）：
 * 项目文件按「项目 / 阶段目录 / 文件」组织，另含公司体系文件（制度 / 岗位说明书等）。
 * 接口层（projects/{code}/documents 与 files/preview）尚未开放字段定义，
 * 当前以演示快照呈现，目录与文件名取自真实文件服务器的目录约定。
 */
import { useMemo, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Files.module.css'

type WorkbenchT = PropsLocale<'yuanshu.workbench'>['t']

/** 文件类型：决定预览形式与图标文案。 */
type FileMime = 'pdf' | 'docx' | 'xlsx' | 'dwg' | 'txt'

/** 目录节点或文件叶子。 */
interface FileEntry {
  readonly id: string
  readonly name: string
  readonly children?: readonly FileEntry[]
  readonly size?: string
  readonly modified?: string
  readonly owner?: string
  readonly mime?: FileMime
  readonly excerpt?: string
}

/** 演示快照：目录结构取自真实文件服务器的项目目录约定。 */
const FILE_TREE: readonly FileEntry[] = [
  {
    id: 'proj', name: '项目文件',
    children: [
      {
        id: 'proj-contract', name: '01 合同与立项',
        children: [
          { id: 'f-contract', name: 'EP220501 合同原件扫描件.pdf', mime: 'pdf', size: '4.2 MB', modified: '2026-03-12', owner: '周伟', excerpt: '合同编号 HT-2026-018 · 甲方：城建发展集团 · 金额 ¥1,860 万 · 付款比例：预付 30%、进度款 60%、验收款 10%。特别注意：进度款以甲方现场代表签认的形象进度确认单为唯一依据。' },
          { id: 'f-approve', name: '立项审批表.docx', mime: 'docx', size: '128 KB', modified: '2026-02-24', owner: '陈静', excerpt: '项目立项评审意见：同意立项，总工期 480 日历天，项目经理周伟，质量目标来料一次合格率 ≥ 98%。' },
          { id: 'f-budget', name: '项目预算明细.xlsx', mime: 'xlsx', size: '356 KB', modified: '2026-03-02', owner: '李娜', excerpt: '预算科目：材料 62% / 人工 18% / 分包 12% / 管理费 8%；毛利率目标 32%。' },
        ],
      },
      {
        id: 'proj-design', name: '02 设计技术文件',
        children: [
          { id: 'f-input', name: '3000 AND 4000 PRODUCT FAMILIES TROUBLESHOOTING MANUAL.pdf', mime: 'pdf', size: '9.8 MB', modified: '2026-04-06', owner: '王强', excerpt: '设计输入文件：Allison 第四代控制系统故障排查手册（英文原版），作为控制系统设计输入引用。' },
          { id: 'f-output', name: '传动系统设计方案 V1.3.docx', mime: 'docx', size: '2.4 MB', modified: '2026-10-08', owner: '王强', excerpt: '基线版本 V1.3：高速开关阀传动方案，含关键参数表与试验大纲引用清单。' },
          { id: 'f-drawing', name: '总布置图 R3.dwg', mime: 'dwg', size: '18.6 MB', modified: '2026-09-22', owner: '赵磊', excerpt: 'DWG 图纸暂不支持在线预览，可下载后用本机 CAD 工具打开；当前版本 R3 已受控归档。' },
        ],
      },
      {
        id: 'proj-quality', name: '03 质量检验',
        children: [
          { id: 'f-inspect', name: '来料检验报告（11 月）.xlsx', mime: 'xlsx', size: '212 KB', modified: '2026-11-18', owner: '赵磊', excerpt: '本月 12 批次主材检验记录：11 批一次合格；钢梁焊缝 1 批待复检，整改单 QC-1120 跟踪中。' },
          { id: 'f-ncr', name: '不合格品处置单 QC-1120.pdf', mime: 'pdf', size: '860 KB', modified: '2026-11-20', owner: '赵磊', excerpt: '处置结论：返修后复检；责任工序为焊接班组，预计 2026-11-25 完成整改。' },
        ],
      },
      {
        id: 'proj-delivery', name: '04 现场交付',
        children: [
          { id: 'f-ship', name: '发运清单（第二批）.xlsx', mime: 'xlsx', size: '96 KB', modified: '2026-11-21', owner: '李娜', excerpt: '第二批 6 车次，计划 2026-11-28 发运；随车文件：装箱单、合格证、探伤报告。' },
          { id: 'f-accept', name: '阶段验收申请（二阶段）.docx', mime: 'docx', size: '154 KB', modified: '2026-11-19', owner: '周伟', excerpt: '二阶段形象进度已完成，申请组织验收；附件含形象进度确认单（甲方待签认）。' },
        ],
      },
    ],
  },
  {
    id: 'sys', name: '体系文件',
    children: [
      {
        id: 'sys-hr', name: 'HR · 岗位说明书',
        children: [
          { id: 'f-duty-pm', name: '岗位说明书——项目经理 V01.docx', mime: 'docx', size: '84 KB', modified: '2022-06-01', owner: '人力资源部', excerpt: '职位概要：负责特种车辆项目全流程管理。岗位职责：负责需求分析与方案论证、总体方案设计与任务书编制、全生命周期技术状态与风险管理、样车计划与试生产管控、设计例会与跨专业协调等。' },
          { id: 'f-duty-qe', name: '质量工程师岗位说明书.docx', mime: 'docx', size: '76 KB', modified: '2022-06-01', owner: '人力资源部', excerpt: '岗位职责：供应商质量管理与改善、供方产品质量检验与控制、制定检验标准与规范、新产品质量策划、质量问题跟踪关闭、质量体系内审支持等。' },
        ],
      },
      {
        id: 'sys-qa', name: '质量体系程序文件',
        children: [
          { id: 'f-qms', name: '质量手册（受控）.pdf', mime: 'pdf', size: '3.1 MB', modified: '2026-05-15', owner: '质量部', excerpt: '受控文件 QM-2026-V3：覆盖 IATF 16949 过程方法、文件与记录控制、不合格品控制程序索引。' },
        ],
      },
    ],
  },
]

/** 在树中按 id 查找文件叶子。 */
function findFile(entries: readonly FileEntry[], id: string): FileEntry | undefined {
  for (const entry of entries) {
    if (entry.id === id) return entry
    if (entry.children !== undefined) {
      const hit = findFile(entry.children, id)
      if (hit !== undefined) return hit
    }
  }
  return undefined
}

/** 渲染目录树节点（文件夹可展开，文件可点击预览）。 */
function TreeNode({ entry, depth, expanded, onToggle, selectedId, onSelect, t }: {
  readonly entry: FileEntry
  readonly depth: number
  readonly expanded: ReadonlySet<string>
  readonly onToggle: (id: string) => void
  readonly selectedId: string | undefined
  readonly onSelect: (id: string) => void
  readonly t: WorkbenchT
}) {
  const isFolder = entry.children !== undefined
  const isOpen = expanded.has(entry.id)
  return <li>
    <button
      type="button"
      className={`${css.treeRow} ${selectedId === entry.id && !isFolder ? css.treeRowActive : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={() => {
        if (isFolder) onToggle(entry.id)
        else onSelect(entry.id)
      }}
      aria-expanded={isFolder ? isOpen : undefined}
    >
      <span className={css.treeIcon}>{isFolder ? (isOpen ? '▾' : '▸') : '📄'}</span>
      <span className={css.treeName}>{entry.name}</span>
    </button>
    {isFolder && isOpen && <ul className={css.treeChildren}>
      {entry.children.map(child => <TreeNode
        key={child.id}
        entry={child}
        depth={depth + 1}
        expanded={expanded}
        onToggle={(id) => { onToggle(id) }}
        selectedId={selectedId}
        onSelect={onSelect}
        t={t}
      />)}
    </ul>}
  </li>
}

/**
 * 渲染文件与资料页。
 * @param props.t - 命名空间翻译函数。
 */
export function FilesScreen({ t }: { readonly t: WorkbenchT }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set(['proj', 'sys', 'proj-contract']))
  const [selectedId, setSelectedId] = useState<string>()
  const selected = useMemo(
    () => (selectedId === undefined ? undefined : findFile(FILE_TREE, selectedId)),
    [selectedId],
  )
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return <div className={css.layout}>
    {/* 左侧目录树。 */}
    <aside className={css.treePane} aria-label={t('files.tree')}>
      <h3 className={css.paneTitle}>{t('files.tree')}</h3>
      <ul className={css.treeRoot}>
        {FILE_TREE.map(entry => <TreeNode
          key={entry.id}
          entry={entry}
          depth={0}
          expanded={expanded}
          onToggle={toggle}
          selectedId={selectedId}
          onSelect={setSelectedId}
          t={t}
        />)}
      </ul>
    </aside>

    {/* 右侧预览。 */}
    <section className={css.previewPane} aria-label={t('files.preview')}>
      <h3 className={css.paneTitle}>{t('files.preview')}</h3>
      {selected === undefined || selected.children !== undefined
        ? <p className={css.hint}>{t('files.selectHint')}</p>
        : <div className={css.previewBody}>
          <h4 className={css.fileName}>{selected.name}</h4>
          <div className={css.metaRow}>
            <span>{selected.mime?.toUpperCase()}</span>
            <span>{t('files.size')}: {selected.size}</span>
            <span>{t('files.modifiedAt')}: {selected.modified}</span>
            <span>{t('files.uploadedBy')}: {selected.owner}</span>
          </div>
          <div className={`${css.excerpt} ${selected.mime === 'dwg' ? css.excerptBlock : ''}`}>
            {selected.excerpt}
          </div>
        </div>}
    </section>
  </div>
}
