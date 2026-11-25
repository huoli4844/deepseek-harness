/** 资料库纯视图函数：分页窗口、字段映射、类型筛选与展示格式化，不依赖请求或组件。 */
import type { DoclibDirectoryNode, DoclibDocument, DoclibLocaleKey, DoclibT } from './model.ts'

/** 文档列表每次请求的记录数。 */
export const DOCLIB_PAGE_SIZE = 20

/** 根据后台匹配数和分页大小计算总页数。 */
export function doclibPageCount(total: number | undefined, pageSize: number): number | undefined {
  return total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize))
}

/** 返回当前组的可点击页码，每组至多十个。 */
export function doclibPageNumbers(page: number, pageCount: number | undefined): readonly number[] {
  if (pageCount === undefined) return [page]
  const start = Math.floor((page - 1) / 10) * 10 + 1
  return Array.from({ length: Math.min(10, pageCount - start + 1) }, (_, index) => start + index)
}

/** 目录路径展示标签：最后一段目录名；空路径返回空串由调用方兜底。 */
export function directoryLabel(path: string): string {
  const segments = path.split('/').filter(segment => segment !== '')
  return segments.at(-1) ?? ''
}

/** 按扩展名与 MIME 归类文档类型，用于图标与类型筛选。 */
export type DoclibMimeKind = 'pdf' | 'word' | 'excel' | 'image' | 'text' | 'archive' | 'other'

/** 类型筛选的固定顺序，`all` 表示不筛选。 */
export type DoclibTypeFilter = DoclibMimeKind | 'all'

/** 类型筛选下拉的全部取值。 */
export const TYPE_FILTERS: readonly DoclibTypeFilter[] = ['all', 'pdf', 'word', 'excel', 'image', 'text', 'archive', 'other']

/** 把 MIME 类型归入有限的展示类别。 */
export function mimeKind(mimeType: string): DoclibMimeKind {
  const mime = mimeType.toLowerCase()
  if (mime.includes('pdf')) return 'pdf'
  if (mime.includes('word') || mime.includes('msword') || mime.includes('officedocument.wordprocessingml')) return 'word'
  if (mime.includes('excel') || mime.includes('spreadsheetml') || mime.includes('csv')) return 'excel'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || mime.includes('markdown')) return 'text'
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar') || mime.includes('rar') || mime.includes('7z')) return 'archive'
  return 'other'
}

/** 按文件名扩展名归类，供本地工作区文件展示图标。 */
export function kindByName(name: string): DoclibMimeKind {
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  if (extension === 'pdf') return 'pdf'
  if (['doc', 'docx', 'rtf', 'pages'].includes(extension)) return 'word'
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(extension)) return 'excel'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(extension)) return 'image'
  if (['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'log', 'ts', 'js', 'tsx', 'jsx', 'py', 'go', 'sh'].includes(extension)) return 'text'
  if (['zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'bz2'].includes(extension)) return 'archive'
  return 'other'
}

/** 按类型筛选当前页文档；`all` 原样返回。 */
export function filterDocuments(
  documents: readonly DoclibDocument[],
  filter: DoclibTypeFilter,
): readonly DoclibDocument[] {
  if (filter === 'all') return documents
  return documents.filter(document => mimeKind(document.mimeType) === filter)
}

/** 文件图标内的短标识，兼顾中英文宽度。 */
export function mimeBadge(kind: DoclibMimeKind): string {
  switch (kind) {
    case 'pdf':
      return 'PDF'
    case 'word':
      return 'DOC'
    case 'excel':
      return 'XLS'
    case 'image':
      return 'IMG'
    case 'text':
      return 'TXT'
    case 'archive':
      return 'ZIP'
    default:
      return '·'
  }
}

/** 已知密级取值到展示文案键的映射；未知取值原样展示。 */
const SENSITIVITY_KEYS: Readonly<Record<string, DoclibLocaleKey>> = {
  public: 'doclib.sensitivity.public',
  internal: 'doclib.sensitivity.internal',
  confidential: 'doclib.sensitivity.confidential',
  secret: 'doclib.sensitivity.secret',
}

/** 密级展示文案键；未知取值返回 undefined，调用方回退原文。 */
export function sensitivityKey(value: string): DoclibLocaleKey | undefined {
  return SENSITIVITY_KEYS[value.trim().toLowerCase()]
}

/** 已知解析状态到展示文案键的映射。 */
const PARSE_STATUS_KEYS: Readonly<Record<string, DoclibLocaleKey>> = {
  parsed: 'doclib.parseStatus.parsed',
  parsing: 'doclib.parseStatus.parsing',
  pending: 'doclib.parseStatus.pending',
  failed: 'doclib.parseStatus.failed',
}

/** 解析状态展示文案键；未知取值返回 undefined，调用方回退原文。 */
export function parseStatusKey(value: string): DoclibLocaleKey | undefined {
  return PARSE_STATUS_KEYS[value.trim().toLowerCase()]
}

/** 密级、解析状态等枚举字段展示：已知取值走文案键，未知取值回退原文，空值显示占位符。 */
export function enumLabel(t: DoclibT, value: string, keyOf: (value: string) => DoclibLocaleKey | undefined): string {
  const key = keyOf(value)
  return key === undefined ? value || '—' : t(key)
}

/** 字节数展示：无值显示占位符，超过 1MB 以 MB 计。 */
export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 北京时间展示：yyyy-MM-dd HH:mm；无效时间返回占位符。 */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return formatter.format(date).replaceAll('/', '-')
}

/** 工作区目录条目排序：文件夹在前，其余按名称排序。 */
export function sortWorkspaceEntries<T extends { readonly name: string; readonly type: string }>(
  entries: readonly T[],
): readonly T[] {
  return [...entries].sort((left, right) => {
    const leftDirectory = left.type === 'directory' ? 0 : 1
    const rightDirectory = right.type === 'directory' ? 0 : 1
    if (leftDirectory !== rightDirectory) return leftDirectory - rightDirectory
    return left.name.localeCompare(right.name, 'zh-Hans-CN')
  })
}

/** 工作区条目类型展示文案键。 */
export function fileKindKey(type: string): DoclibLocaleKey {
  switch (type) {
    case 'directory':
      return 'doclib.fileKind.directory'
    case 'file':
      return 'doclib.fileKind.file'
    case 'symlink':
      return 'doclib.fileKind.symlink'
    default:
      return 'doclib.fileKind.other'
  }
}

/** 相对路径拆成面包屑段，根路径返回空数组。 */
export function pathSegments(path: string): readonly { readonly name: string; readonly path: string }[] {
  const names = path.split('/').filter(segment => segment !== '')
  return names.map((name, index) => ({ name, path: names.slice(0, index + 1).join('/') }))
}

/** 相对路径的上一级；根路径返回空串。 */
export function parentPath(path: string): string {
  const segments = path.split('/').filter(segment => segment !== '')
  return segments.slice(0, -1).join('/')
}

/** 由文档的目录字段聚合出扁平目录树；计数包含该目录及全部子目录的文档。 */
export function directoryNodes(documents: readonly DoclibDocument[]): readonly DoclibDirectoryNode[] {
  const counts = new Map<string, number>()
  for (const document of documents) {
    const segments = document.directoryPath.split('/').filter(segment => segment !== '')
    for (let level = 1; level <= segments.length; level += 1) {
      const path = segments.slice(0, level).join('/')
      counts.set(path, (counts.get(path) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'zh-Hans-CN'))
    .map(([path, count]) => ({
      path,
      name: path.slice(path.lastIndexOf('/') + 1),
      depth: path.split('/').length - 1,
      count,
    }))
}

/** 目录内的文档：命中该目录本身或其后代目录。 */
export function documentsInDirectory(
  documents: readonly DoclibDocument[],
  path: string,
): readonly DoclibDocument[] {
  return documents.filter(document =>
    document.directoryPath === path || document.directoryPath.startsWith(`${path}/`))
}

/** 本地关键字匹配：标题或原文件名包含关键字（大小写不敏感）。 */
export function matchesKeyword(document: DoclibDocument, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase()
  if (needle === '') return true
  return document.title.toLowerCase().includes(needle) || document.originalName.toLowerCase().includes(needle)
}
