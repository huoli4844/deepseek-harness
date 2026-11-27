import { expect, it } from 'vitest'
import { resolveDragFileName } from '../src/index.ts'

it.each([
  [{ name: 'photo.jpeg', mediaType: 'image/jpeg' }, 'photo.jpeg'],
  [{ name: 'photo.JPEG', mediaType: 'IMAGE/JPEG; charset=utf-8' }, 'photo.JPEG'],
  [{ name: '报告', mediaType: 'application/pdf' }, '报告.pdf'],
  [{ mediaType: 'application/pdf' }, 'file.pdf'],
  [{ name: 'report.png', mediaType: 'application/pdf' }, 'report.pdf'],
  [{ name: 'report.pdf', mediaType: 'application/pdf', outputExtension: '.bin' }, 'report.bin'],
  [{ name: 'report', mediaType: 'application/pdf', outputExtension: 'bin' }, 'report.bin'],
  // 通用二进制 MIME 不应覆盖调用方已有的扩展名。
  [{ name: '报告.pdf', mediaType: 'application/octet-stream' }, '报告.pdf'],
  [{ name: 'archive.zip', mediaType: 'application/octet-stream' }, 'archive.zip'],
  [{ name: 'report', mediaType: 'application/octet-stream' }, 'report.bin'],
  [{ name: 'custom.asset', mediaType: 'application/x-custom' }, 'custom.asset'],
  [{ name: 'custom', mediaType: 'application/x-custom' }, 'custom'],
  [{ name: '  .. ', mediaType: '' }, 'file'],
  [{ name: 'CON.pdf', mediaType: 'application/pdf' }, '_CON.pdf'],
  [{ name: '../../report.pdf', mediaType: 'application/pdf' }, '_.._report.pdf'],
])('resolves %j to %s', (request, expected) => {
  expect(resolveDragFileName(request)).toBe(expected)
})

it('bounds the filename without cutting off its extension', () => {
  expect(resolveDragFileName({ name: `${'a'.repeat(500)}.pdf`, mediaType: 'application/pdf' })).toBe(`${'a'.repeat(251)}.pdf`)
})

it.each(['图'.repeat(90), '😀'.repeat(100)])('bounds Unicode names by UTF-8 bytes without splitting characters', (name) => {
  const output = resolveDragFileName({ name: `${name}.pdf`, mediaType: 'application/pdf' })
  expect(new TextEncoder().encode(output).length).toBeLessThanOrEqual(255)
  expect(output.endsWith('.pdf')).toBe(true)
  expect(output).not.toContain('\uFFFD')
  expect(output.isWellFormed()).toBe(true)
})
