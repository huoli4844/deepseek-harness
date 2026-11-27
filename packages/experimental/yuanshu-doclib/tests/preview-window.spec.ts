// @vitest-environment jsdom
/** 验证独立预览窗口页：文本加载后可按 Ctrl/⌘+F 搜索、命中高亮与上下跳转。 */
import { afterEach, expect, it, vi } from 'vitest'
import { previewWindowHtml } from '../src/preview-window.ts'

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  vi.restoreAllMocks()
})

/**
 * 页面在 jsdom 的脚本上下文里执行，缺 fetch 与 TextDecoder，这里按纯文本响应补齐最小实现。
 * @param body - 预览接口返回的文本。
 * @returns 注入到页面脚本前的兼容代码。
 */
function browserShim(body: string): string {
  const bytes = JSON.stringify([...new TextEncoder().encode(body)])
  return `var __bytes = ${bytes};
var fetch = function () {
  return Promise.resolve({ ok: true, status: 200, blob: function () {
    return Promise.resolve({ arrayBuffer: function () { return Promise.resolve(new Uint8Array(__bytes).buffer); } });
  } });
};
var TextDecoder = function () {
  this.decode = function (buffer) {
    var view = new Uint8Array(buffer), out = '';
    for (var i = 0; i < view.length; i++) out += String.fromCharCode(view[i]);
    return out;
  };
};
`
}

/**
 * 把生成的 HTML 挂到 jsdom：先放页面结构，再插入带兼容层的脚本节点执行页面内联逻辑。
 * @param html - {@link previewWindowHtml} 生成的页面。
 * @param body - 预览接口返回的文本。
 */
function mountPage(html: string, body: string): void {
  const markup = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  document.body.innerHTML = markup.replace(/<script>[\s\S]*?<\/script>/u, '')
  const script = document.createElement('script')
  script.textContent = browserShim(body) + (html.match(/<script>([\s\S]*?)<\/script>/u)?.[1] ?? '')
  document.body.appendChild(script)
}

it('文本预览页支持搜索高亮、命中计数与下一个/上一个跳转', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  mountPage(previewWindowHtml({ id: 'file-1', name: 'demo.txt', mime: 'text/plain' }), 'alpha beta alpha')

  await vi.waitFor(() => { expect(document.querySelector('pre.text')).not.toBeNull() })
  expect(document.querySelectorAll('mark.hit')).toHaveLength(0)

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true }))
  const bar = document.getElementById('search')
  const input = document.getElementById('searchInput') as HTMLInputElement
  expect(bar?.hasAttribute('hidden')).toBe(false)
  expect(document.activeElement).toBe(input)

  input.value = 'alpha'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(document.querySelectorAll('mark.hit')).toHaveLength(2)
  expect(document.getElementById('searchCount')?.textContent).toBe('第 1 / 2 个')

  document.getElementById('searchNext')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(document.getElementById('searchCount')?.textContent).toBe('第 2 / 2 个')
  expect(document.querySelectorAll('mark.hit.active')).toHaveLength(1)
})

it('无匹配时显示无匹配，关闭搜索后清除高亮', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  mountPage(previewWindowHtml({ id: 'file-2', name: 'demo.txt', mime: 'text/plain' }), 'alpha')
  await vi.waitFor(() => { expect(document.querySelector('pre.text')).not.toBeNull() })

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true }))
  const input = document.getElementById('searchInput') as HTMLInputElement
  input.value = 'missing'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(document.getElementById('searchCount')?.textContent).toBe('无匹配')
  expect(document.querySelectorAll('mark.hit')).toHaveLength(0)

  document.getElementById('searchClose')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(document.getElementById('search')?.hasAttribute('hidden')).toBe(true)
})
