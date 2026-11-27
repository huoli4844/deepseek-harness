/** 资料库 Office 预览：宿主内把 Office 原始字节转为 PDF，供应用内 iframe 展示。 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-office-kit'
import type { OfficeExtension, OfficeKitRequest, OfficeSourceKey } from '@deepseek-ai/dsh-office-kit/types'
import { brandString } from '@deepseek-ai/dsh-brand'

/** 同源路由路径：客户端把原始 Office 字节 POST 到这里换取 PDF。 */
export const OFFICE_PREVIEW_PATH = '/yuanshu-doclib/office/pdf'

/** 支持的 Office 扩展名：与 officeKit 的 PDF 预览输入一致。 */
const OFFICE_EXTENSIONS: readonly OfficeExtension[] = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']

/** Office 预览请求体上限：与原文预览保持一致。 */
const OFFICE_PREVIEW_MAX_BYTES = 64 * 1024 * 1024

/** 转换超时：LibreOffice 首次启动较慢，给足两分钟。 */
const OFFICE_CONVERT_TIMEOUT_MS = 120_000

/** 请求体读取结果：成功字节或超出上限。 */
type BytesResult = { readonly bytes: Uint8Array } | { readonly tooLarge: true }

/** 读取原始字节，超过上限立即停止累积。 */
async function readRequestBytes(req: IncomingMessage, limit: number): Promise<BytesResult> {
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > limit) return { tooLarge: true }
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength
    if (total > limit) return { tooLarge: true }
    chunks.push(buffer)
  }
  return { bytes: Buffer.concat(chunks) }
}

/**
 * FNV-1a 32 位哈希：把内存字节压成稳定短标识，供 officeKit 源缓存去重。
 * @param bytes - 文件字节。
 * @returns 八位十六进制哈希。
 */
function fingerprint(bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * 读取并校验 ext 查询参数。
 * @param params - 请求查询串。
 * @returns 支持的扩展名；未知或缺失返回 undefined。
 */
export function officeExtension(params: URLSearchParams): OfficeExtension | undefined {
  const requested = (params.get('ext') ?? '').trim().toLowerCase()
  return OFFICE_EXTENSIONS.find(extension => extension === requested)
}

/** 响应 JSON 错误；只暴露错误类别与错误码，不带内部路径或引擎诊断。 */
function jsonError(res: ServerResponse, status: number, body: Readonly<Record<string, string>>): void {
  res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** 从 officeKit 抛出的错误中取错误码；未知错误归为 failed。 */
function errorCode(cause: unknown): string {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined
  return typeof code === 'string' && code !== '' ? code : 'failed'
}

/**
 * 处理 Office→PDF 预览：请求体即原始 Office 字节，转换成功后返回 PDF 字节流。
 * 服务不可用返回 503，转换失败返回 502（只带错误码），请求体超限返回 413。
 * @param ctx - 插件上下文，用于取 officeKit 服务。
 * @param req - 原始字节请求。
 * @param res - 响应对象。
 * @param warn - 宿主日志，只记录失败类别。
 */
export async function handleOfficePreview(
  ctx: Context,
  req: IncomingMessage,
  res: ServerResponse,
  warn: (message: string) => void,
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' })
    res.end()
    return
  }
  const extension = officeExtension(new URL(req.url ?? '/', 'http://localhost').searchParams)
  if (extension === undefined) {
    jsonError(res, 400, { error: 'unsupported-extension' })
    return
  }
  const officeKit = ctx.get('officeKit')
  if (officeKit === undefined) {
    jsonError(res, 503, { error: 'office-unavailable' })
    return
  }
  const body = await readRequestBytes(req, OFFICE_PREVIEW_MAX_BYTES)
  if ('tooLarge' in body) {
    jsonError(res, 413, { error: 'preview-too-large' })
    return
  }
  if (body.bytes.byteLength === 0) {
    jsonError(res, 400, { error: 'empty-body' })
    return
  }
  // 源标识由扩展名、长度与内容哈希组成：同一文件重复预览可命中 officeKit 的缓存。
  const version = `${extension}:${body.bytes.byteLength}:${fingerprint(body.bytes)}`
  const request: OfficeKitRequest = {
    extension,
    priority: 'foreground',
    source: {
      key: brandString<OfficeSourceKey>(`yuanshu-doclib:${version}`),
      version,
      bytes: body.bytes.byteLength,
      read: () => Promise.resolve({ bytes: body.bytes, version }),
    },
  }
  try {
    const { pdf } = await officeKit.convert(request, AbortSignal.timeout(OFFICE_CONVERT_TIMEOUT_MS))
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/pdf',
      'content-length': String(pdf.byteLength),
      'x-content-type-options': 'nosniff',
    })
    res.end(pdf)
  } catch (cause) {
    const code = errorCode(cause)
    warn(`YuanShu doclib Office preview failed (${code})`)
    jsonError(res, 502, { error: 'office-conversion-failed', code })
  }
}
