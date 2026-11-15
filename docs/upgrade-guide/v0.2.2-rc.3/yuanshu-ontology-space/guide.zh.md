---
kind: upgrade-guide
description: "读取本体集合必须显式指定空间标识。"
---

# 读取本体集合前选择空间

[English](guide.md) | 中文

## 变更

`YuanShuClient.listOntologyCollections(spaceId, limit?)` 必须接收正整数空间 ID。原来的可选首参数表示分页大小。网关拒绝缺少有效 `space_id` 的集合请求，避免继续转发不完整参数。

## 迁移

1. 读取 `listOntologySpaces()`，选择有权访问的空间 ID。
2. 将 `listOntologyCollections(limit)` 改为 `listOntologyCollections(spaceId, limit)`。使用网关时，为 `/yuanshu-api/ontology/collections` 添加 `?space_id=<id>`。
3. 可将该 ID 作为 `listOntologyReleases(limit, spaceId)` 的第二参数，或网关发布版本请求的查询参数。
4. 确认返回的集合属于选定空间，缺失或无效 ID 返回 HTTP 400。
