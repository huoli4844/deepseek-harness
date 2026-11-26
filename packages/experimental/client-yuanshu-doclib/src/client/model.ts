/** 资料库界面模型：知识库集合、文档条目与页签状态，只保留渲染所需字段。 */
import type { en } from './locales.ts'

/** 资料库文案键集合，与 locales.ts 英文键一一对应。 */
export type DoclibLocaleKey = keyof typeof en

/** 翻译函数坐席：键集与 doclib 命名空间一一对应。 */
export type DoclibT = (key: DoclibLocaleKey, params?: Readonly<Record<string, unknown>>) => string

/** 知识库集合条目（项目文件夹、公司制度文件的载体）。 */
export interface DoclibCollection {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly description: string
}

/** 知识库文档条目。 */
export interface DoclibDocument {
  readonly id: string
  readonly title: string
  readonly originalName: string
  /** 文档在后台知识库中的目录路径，如"体系文件第三套/质量手册"。 */
  readonly directoryPath: string
  readonly mimeType: string
  readonly sensitivity: string
  readonly parseStatus: string
  readonly tags: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  /** 预览接口使用的文件 ID；详情接口未返回时为空串。 */
  readonly fileId: string
}

/** 知识库文档分页结果。 */
export interface DoclibDocumentPage {
  readonly list: readonly DoclibDocument[]
  readonly page: number
  readonly pageSize: number
  readonly total: number
}

/** 资料库页签：个人资料（本地工作区）/ 项目文件夹 / 公司制度文件。 */
export type DoclibTab = 'personal' | 'projects' | 'policies'

/** 排序方向。 */
export type SortDirection = 'asc' | 'desc'

/** 本地工作区列表可排序字段。 */
export type WorkspaceSortField = 'name' | 'kind' | 'size'

/** 知识库文档列表可排序字段。 */
export type DocumentSortField = 'title' | 'directory' | 'sensitivity' | 'updatedAt'

/** 排序状态：字段与方向。 */
export interface SortState<Field extends string> {
  readonly field: Field
  readonly direction: SortDirection
}

/** 工作区条目属性（详情弹窗展示）。 */
export interface WorkspaceEntryDetail {
  readonly name: string
  readonly type: string
  readonly size: number
  readonly modifiedAt: string
}

/** 文档列表查询条件；keyword 为空表示不过滤。 */
export interface DoclibQuery {
  readonly collectionId: string
  readonly keyword: string
  readonly page: number
  readonly pageSize: number
}

/** 后台数据源请求错误类别：401 表示未登录元枢。 */
export type DoclibRequestError = 'login' | 'failed'

/** 由文档目录字段聚合出的目录节点（层级来自 directory_path）。 */
export interface DoclibDirectoryNode {
  readonly path: string
  readonly name: string
  readonly depth: number
  readonly count: number
}

/** NAS（外部存储）当前配置；凭证只回报是否已配置，不回显明文。 */
export interface StorageConfig {
  readonly endpoint: string
  readonly bucket: string
  readonly region: string
  readonly useSsl: boolean
  readonly configured: boolean
  readonly credentialsConfigured: boolean
  readonly credentialSource: string
}

/** 外部存储健康检查结果。 */
export interface StorageHealth {
  readonly healthy: boolean
  readonly readable: boolean
  readonly writable: boolean
  readonly message: string
  readonly latencyMs: number
}

/** NAS 配置编辑草稿；凭证留空表示沿用现有配置。 */
export interface StorageDraft {
  readonly endpoint: string
  readonly bucket: string
  readonly region: string
  readonly useSsl: boolean
  readonly accessKey: string
  readonly secretKey: string
}
