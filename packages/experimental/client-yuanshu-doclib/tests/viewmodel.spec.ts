/** 校验资料库纯视图函数：分页窗口、类型映射与筛选、路径与格式化。 */
import { expect, it } from 'vitest'
import { currentWorkspace, type SessionsService } from '../src/client/workspace-source.ts'
import {
  directoryLabel, directoryNodes, doclibPageCount, doclibPageNumbers, documentsInDirectory, enumLabel,
  fileKindKey, filterDocuments, formatSize, formatTime, kindByName, matchesKeyword, mimeBadge, mimeKind,
  parentPath, parseStatusKey, pathSegments, sensitivityKey, sortWorkspaceEntries,
} from '../src/client/viewmodel.ts'
import type { DoclibDocument } from '../src/client/model.ts'

/** 构造最小文档条目，仅覆盖筛选所需字段。 */
function document(id: string, mimeType: string): DoclibDocument {
  return {
    id, title: id, originalName: id, directoryPath: '', mimeType, sensitivity: '', parseStatus: '',
    tags: [], createdAt: '', updatedAt: '', fileId: '',
  }
}

it('分页页数与十页窗口计算', () => {
  expect(doclibPageCount(0, 20)).toBe(1)
  expect(doclibPageCount(21, 20)).toBe(2)
  expect(doclibPageCount(undefined, 20)).toBeUndefined()
  expect(doclibPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5])
  expect(doclibPageNumbers(11, 25)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
})

it('MIME 与扩展名映射到有限类型，未知取值归入其他', () => {
  expect(mimeKind('application/pdf')).toBe('pdf')
  expect(mimeKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('word')
  expect(mimeKind('text/csv')).toBe('excel')
  expect(mimeKind('image/png')).toBe('image')
  expect(mimeKind('application/zip')).toBe('archive')
  expect(mimeKind('application/octet-stream')).toBe('other')
  expect(kindByName('质量手册.pdf')).toBe('pdf')
  expect(kindByName('计划.DOCX')).toBe('word')
  expect(kindByName('数据.csv')).toBe('excel')
  expect(kindByName('截图.png')).toBe('image')
  expect(kindByName('说明.md')).toBe('text')
  expect(kindByName('打包.zip')).toBe('archive')
  expect(kindByName('无扩展名')).toBe('other')
  expect(mimeBadge('pdf')).toBe('PDF')
  expect(mimeBadge('unknown-kind' as never)).toBe('·')
})

it('类型筛选只保留指定类别，全部类型不过滤', () => {
  const documents = [document('a', 'application/pdf'), document('b', 'image/png'), document('c', 'text/plain')]
  expect(filterDocuments(documents, 'all').map(item => item.id)).toEqual(['a', 'b', 'c'])
  expect(filterDocuments(documents, 'pdf').map(item => item.id)).toEqual(['a'])
  expect(filterDocuments(documents, 'excel')).toEqual([])
  expect(filterDocuments(documents, 'other').length).toBe(0)
})

it('密级与解析状态映射到文案键，未知取值回退原文', () => {
  expect(sensitivityKey('Internal')).toBe('doclib.sensitivity.internal')
  expect(sensitivityKey('mystery')).toBeUndefined()
  expect(parseStatusKey('parsed')).toBe('doclib.parseStatus.parsed')
  const t = (key: string) => `文案:${key}`
  expect(enumLabel(t, 'internal', sensitivityKey)).toBe('文案:doclib.sensitivity.internal')
  expect(enumLabel(t, '自定义', sensitivityKey)).toBe('自定义')
  expect(enumLabel(t, '', sensitivityKey)).toBe('—')
})

it('大小与时间格式化：北京时间、无效值占位', () => {
  expect(formatSize(undefined)).toBe('—')
  expect(formatSize(512)).toBe('512 B')
  expect(formatSize(2048)).toBe('2.0 KB')
  expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB')
  expect(formatTime('')).toBe('—')
  expect(formatTime('not-a-date')).toBe('—')
  expect(formatTime('2026-11-25T00:30:00+08:00')).toMatch(/^2026-11-25 00:30$/u)
})

it('目录标签、面包屑与上一级路径', () => {
  expect(directoryLabel('体系文件第三套/质量手册')).toBe('质量手册')
  expect(directoryLabel('')).toBe('')
  expect(pathSegments('')).toEqual([])
  expect(pathSegments('docs/api')).toEqual([{ name: 'docs', path: 'docs' }, { name: 'api', path: 'docs/api' }])
  expect(parentPath('docs/api')).toBe('docs')
  expect(parentPath('docs')).toBe('')
  expect(fileKindKey('directory')).toBe('doclib.fileKind.directory')
  expect(fileKindKey('socket')).toBe('doclib.fileKind.other')
})

it('工作区条目排序：文件夹在前，文件按名称排序', () => {
  const sorted = sortWorkspaceEntries([
    { name: 'z.txt', type: 'file' },
    { name: '文件夹', type: 'directory' },
    { name: 'a.txt', type: 'file' },
  ])
  expect(sorted.map(entry => entry.name)).toEqual(['文件夹', 'a.txt', 'z.txt'])
})

it('由目录字段聚合目录树，并按目录前缀取文档', () => {
  const documents = [
    { ...document('a', 'application/pdf'), title: '质量手册', directoryPath: '体系/质量手册' },
    { ...document('b', 'application/pdf'), directoryPath: '体系/程序文件' },
    { ...document('c', 'application/pdf'), directoryPath: '计划' },
  ]
  const nodes = directoryNodes(documents)
  expect(nodes.map(node => `${node.path}:${node.count}`)).toEqual(['计划:1', '体系:2', '体系/程序文件:1', '体系/质量手册:1'])
  expect(nodes.find(node => node.path === '体系/程序文件')?.depth).toBe(1)
  expect(documentsInDirectory(documents, '体系').map(item => item.id)).toEqual(['a', 'b'])
  expect(documentsInDirectory(documents, '体系/质量手册').map(item => item.id)).toEqual(['a'])
  expect(documentsInDirectory(documents, '不存在')).toEqual([])
  expect(matchesKeyword(documents[0], '质量')).toBe(true)
  expect(matchesKeyword(documents[0], '')).toBe(true)
  expect(matchesKeyword(documents[0], '计划')).toBe(false)
})

it('当前工作区取第一个非空会话的 cwd，否则退回任意带目录的会话', () => {
  const service = (byId: Record<string, unknown>, ids: readonly string[]): SessionsService => ({
    list: {
      getSnapshot: () => ({ ids, byId }) as never,
      subscribe: () => () => undefined,
    },
  })
  const blank = { id: 'b', blank: true, cwd: '/tmp/ws' }
  const normal = { id: 's-1', blank: false, cwd: '/tmp/project' }
  expect(currentWorkspace(service({ 's-1': normal }, ['s-1']).list.getSnapshot())).toEqual({
    sessionId: 's-1', root: '/tmp/project',
  })
  expect(currentWorkspace(service({ 'b': blank }, ['b']).list.getSnapshot())).toEqual({
    sessionId: 'b', root: '/tmp/ws',
  })
  expect(currentWorkspace(service({ 'b': blank, 's-1': normal }, ['b', 's-1']).list.getSnapshot())?.root)
    .toBe('/tmp/project')
  expect(currentWorkspace(service({}, []).list.getSnapshot())).toBeUndefined()
})
