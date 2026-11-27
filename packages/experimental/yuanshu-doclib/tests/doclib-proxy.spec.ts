/** 校验资料库代理的路径映射与方法约束，不依赖实际后台。 */
import { expect, it } from 'vitest'
import { doclibProxyRoute } from '../src/doclib-proxy.ts'

it('集合与文档列表走固定路由，详情与预览按 ID 转发', () => {
  expect(doclibProxyRoute('/yuanshu-doclib/collections', 'GET')).toEqual({
    type: 'read', remote: '/api/v1/knowledge-bases/collections',
  })
  expect(doclibProxyRoute('/yuanshu-doclib/documents', 'GET')).toEqual({
    type: 'read', remote: '/api/v1/knowledge-bases/documents',
  })
  expect(doclibProxyRoute('/yuanshu-doclib/documents/doc_01h9x', 'GET')).toEqual({
    type: 'read', remote: '/api/v1/knowledge-bases/documents/doc_01h9x',
  })
  expect(doclibProxyRoute('/yuanshu-doclib/files/file-42/preview', 'GET')).toEqual({
    type: 'preview', remote: '/api/v1/files/file-42/preview',
  })
})

it('资料库写路径：文档删除、导入与文件上传限定方法', () => {
  expect(doclibProxyRoute('/yuanshu-doclib/collections', 'POST')).toEqual({ type: 'method', allow: 'GET' })
  expect(doclibProxyRoute('/yuanshu-doclib/documents', 'PUT')).toEqual({ type: 'method', allow: 'GET' })
  expect(doclibProxyRoute('/yuanshu-doclib/documents/doc_01h9x', 'DELETE')).toEqual({
    type: 'write', remote: '/api/v1/knowledge-bases/documents/doc_01h9x',
  })
  expect(doclibProxyRoute('/yuanshu-doclib/documents/doc_01h9x', 'PUT')).toEqual({
    type: 'method', allow: 'GET, DELETE',
  })
  expect(doclibProxyRoute('/yuanshu-doclib/documents/ingest', 'POST')).toEqual({
    type: 'write', remote: '/api/v1/knowledge-bases/documents/ingest',
  })
  expect(doclibProxyRoute('/yuanshu-doclib/documents/ingest', 'GET')).toEqual({ type: 'method', allow: 'POST' })
  expect(doclibProxyRoute('/yuanshu-doclib/files/upload', 'POST')).toEqual({
    type: 'upload', remote: '/api/v1/files/upload',
  })
  expect(doclibProxyRoute('/yuanshu-doclib/files/upload', 'GET')).toEqual({ type: 'method', allow: 'POST' })
  expect(doclibProxyRoute('/yuanshu-doclib/files/file-42/preview', 'POST')).toEqual({ type: 'method', allow: 'GET' })
})

it('NAS 存储配置只允许 GET/PUT，其余方法不匹配', () => {
  expect(doclibProxyRoute('/yuanshu-doclib/storage/config', 'GET')).toEqual({
    type: 'read', remote: '/api/v1/files/storage/external/config',
  })
  expect(doclibProxyRoute('/yuanshu-doclib/storage/config', 'PUT')).toEqual({
    type: 'write', remote: '/api/v1/files/storage/external/config',
  })
  expect(doclibProxyRoute('/yuanshu-doclib/storage/config', 'DELETE')).toEqual({
    type: 'method', allow: 'GET, PUT',
  })
  expect(doclibProxyRoute('/yuanshu-doclib/storage/health', 'GET')).toEqual({
    type: 'read', remote: '/api/v1/files/storage/external/health',
  })
  expect(doclibProxyRoute('/yuanshu-doclib/storage/health', 'PUT')).toEqual({ type: 'method', allow: 'GET' })
})

it('未知路径、路径穿越与伪 ID 不映射', () => {
  expect(doclibProxyRoute('/yuanshu-doclib/unknown', 'GET')).toBeUndefined()
  expect(doclibProxyRoute('/yuanshu-doclib/documents/..%2f..%2fsecret', 'GET')).toBeUndefined()
  expect(doclibProxyRoute('/yuanshu-doclib/documents/', 'GET')).toBeUndefined()
  expect(doclibProxyRoute('/yuanshu-doclib/files/file-42/download', 'GET')).toBeUndefined()
  expect(doclibProxyRoute('/yuanshu-doclib/files/..%2f/preview', 'GET')).toBeUndefined()
})
