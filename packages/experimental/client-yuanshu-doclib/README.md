# @deepseek-ai/dsh-client-yuanshu-doclib

元枢「资料库」插件：与元枢工作台并列的主面板，左侧分类栏 + 右侧内容区，按三类资料浏览企业文档与本地文件。

## 目标岗位

企业员工与管理者：在个人工作台中查阅个人资料、项目文件夹与公司制度文件。

## 资料分类与数据范围

| 页签 | 数据来源 | 范围 |
| --- | --- | --- |
| 个人资料 | DSH 平台自身 `workspaceFiles.list`（不走元枢代理） | 当前会话工作区目录树，只读懒加载 |
| 项目文件夹 | 元枢后台知识库集合 + 文档接口 | 选中集合内的文档列表、目录树（由 `directory_path` 前端聚合）、搜索、详情、原文预览 |
| 公司制度文件 | 元枢后台知识库集合 + 文档接口 | 同上，独立集合选择、目录与搜索状态 |

NAS（网络存储）配置取自后台「外部存储」接口，入口在左侧栏底部的齿轮按钮：

| 方法 | 同源路径 | 上游路径 |
| --- | --- | --- |
| GET | `/yuanshu-doclib/storage/config` | `/api/v1/files/storage/external/config` |
| PUT | `/yuanshu-doclib/storage/config` | `/api/v1/files/storage/external/config` |
| GET | `/yuanshu-doclib/storage/health` | `/api/v1/files/storage/external/health` |

## HTTP 方法与路径（宿主代理）

| 方法 | 同源路径 | 上游路径 |
| --- | --- | --- |
| GET | `/yuanshu-doclib/collections` | `/api/v1/knowledge-bases/collections` |
| GET | `/yuanshu-doclib/documents` | `/api/v1/knowledge-bases/documents` |
| GET | `/yuanshu-doclib/documents/{id}` | `/api/v1/knowledge-bases/documents/{id}` |
| GET | `/yuanshu-doclib/files/{fileId}/preview` | `/api/v1/files/{fileId}/preview` |

代理透传 `authorization` 与 `X-Active-Tenant`；除 NAS 配置的 PUT 外不放行任何写方法。

## 边界

- 不修改、不删除任何知识库文档或文件。
- 唯一写动作是保存 NAS（外部存储）配置；凭证留空时沿用服务端已有密钥，不回显明文。
- 个人资料页签仅列名称、类型与大小，不读取文件内容。
- 原文预览由浏览器端把上游字节流转为本地 Blob 临时地址打开，不留存。
- 目录树由当前集合文档的 `directory_path` 前端聚合（最多读取 1000 份），后台目录接口暂无数据。
