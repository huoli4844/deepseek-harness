# 资料库（client-yuanshu-doclib）

元枢「资料库」插件：与元枢工作台并列的主面板，左侧分类栏 + 右侧内容区，按三类资料浏览企业文档与本地文件。

## 目标岗位

企业员工与管理者：在个人工作台中像访问文件服务器一样管理个人资料，并查阅项目文件夹与公司制度文件。

## 资料分类与数据范围

| 页签 | 数据来源 | 范围 |
| --- | --- | --- |
| 个人资料 | DSH 平台自身 `workspaceFiles.list` + 宿主工作区文件路由 | 当前会话工作区目录树，可浏览、搜索、排序、新建、上传、下载、重命名、移动、复制、删除与查看属性 |
| 项目文件夹 | 元枢后台知识库集合 + 文档接口 | 选中集合内的文档列表、目录树（由 `directory_path` 前端聚合）、搜索、排序、上传、下载、预览、删除与详情 |
| 公司制度文件 | 元枢后台知识库集合 + 文档接口 | 同上，独立集合选择、目录与搜索状态 |

NAS（网络存储）配置取自后台「外部存储」接口，入口在左侧栏底部的齿轮按钮。

## HTTP 方法与路径（宿主代理）

远端知识库转发到元枢后台，透传 `authorization` 与 `X-Active-Tenant`：

| 方法 | 同源路径 | 上游路径 |
| --- | --- | --- |
| GET | `/yuanshu-doclib/collections` | `/api/v1/knowledge-bases/collections` |
| GET | `/yuanshu-doclib/documents` | `/api/v1/knowledge-bases/documents` |
| GET | `/yuanshu-doclib/documents/{id}` | `/api/v1/knowledge-bases/documents/{id}` |
| DELETE | `/yuanshu-doclib/documents/{id}` | `/api/v1/knowledge-bases/documents/{id}` |
| POST | `/yuanshu-doclib/documents/ingest` | `/api/v1/knowledge-bases/documents/ingest` |
| GET | `/yuanshu-doclib/files/{fileId}/preview` | `/api/v1/files/{fileId}/preview` |
| POST | `/yuanshu-doclib/files/upload` | `/api/v1/files/upload`（multipart 流式转发） |
| GET / PUT | `/yuanshu-doclib/storage/config` | `/api/v1/files/storage/external/config` |
| GET | `/yuanshu-doclib/storage/health` | `/api/v1/files/storage/external/health` |

本地工作区由宿主直接操作磁盘（不经过元枢后台）。每个请求都带 `session` 与 `root`，宿主校验会话工作区根一致，并对真实路径做前缀检查，拒绝符号链接越界：

| 方法 | 同源路径 | 作用 |
| --- | --- | --- |
| POST | `/yuanshu-doclib/workspace/mkdir` | 新建文件夹 |
| POST | `/yuanshu-doclib/workspace/rename` | 重命名 |
| POST | `/yuanshu-doclib/workspace/move` | 移动（跨卷退化为复制后删除） |
| POST | `/yuanshu-doclib/workspace/copy` | 复制（同目录自动使用「副本」命名） |
| POST | `/yuanshu-doclib/workspace/delete` | 递归删除（拒绝删除工作区根） |
| POST | `/yuanshu-doclib/workspace/upload` | 原始字节流上传，单文件上限 2 GiB |
| GET | `/yuanshu-doclib/workspace/download` | 下载原始字节流 |
| GET | `/yuanshu-doclib/workspace/stat` | 属性（名称、类型、大小、修改时间） |

## 文件动作

### 个人资料（本地文件）

| 手势 | 行为 |
| --- | --- |
| 双击文件夹行 / 点击名称 | 进入子目录 |
| 双击文件行 | 用系统默认应用打开（`remote.session.openWorkspacePath`） |
| 工具栏 / 右键 | 新建文件夹、上传（可多选文件）、刷新、按名称/类型/大小排序、当前目录搜索 |
| 多选后工具栏 / 右键 | 批量下载、复制、移动、删除 |
| 右键文件 | 打开、打开所在文件夹、下载、重命名、移动、复制、删除、属性、复制名称、复制路径 |
| 右键文件夹 | 打开、重命名、移动、复制、删除、属性、复制名称、复制路径 |

删除必须二次确认；重命名、移动与复制通过弹窗输入名称或目标目录。下载经桌面 `fileActions.save(source, 'saveAs')` 弹出系统保存位置，Web 端退回浏览器下载。

### 项目文件夹 / 公司制度文件（远端文档）

| 手势 | 行为 |
| --- | --- |
| 工具栏上传 | 先 `POST /files/upload` 取得文件 ID，再 `POST /documents/ingest` 导入当前集合与目录 |
| 表头 / 排序下拉 | 按标题、目录、密级、更新时间排序（本地排序当前索引后再分页） |
| 多选后工具栏 / 右键 | 批量删除（逐份 `DELETE /documents/{id}`），删除前二次确认 |
| 右键下载 | 桌面另存对话框，字节来自 `/files/{fileId}/preview` |
| 右键预览原文 / 属性 | 打开临时 Blob 预览 / 文档详情 |
| 右键复制名称 / 复制目录 | 写入剪贴板 |

## 边界

- 远端知识库只开放上传、下载、预览、删除；线上重命名与移动接口当前返回 500，界面不提供这两个动作。
- 个人资料的写操作仅限当前会话工作区根目录内，路径逐段校验并解析真实路径，拒绝 `..`、绝对路径与符号链接越界。
- 唯一的知识库配置写入口是 NAS（外部存储）配置；凭证留空时沿用服务端已有密钥，不回显明文。
- 原文预览由浏览器端把上游字节流转为本地 Blob 临时地址打开，不留存。
- 目录树由当前集合文档的 `directory_path` 前端聚合（最多读取 1000 份），后台目录节点接口返回空列表，暂不用于浏览。
