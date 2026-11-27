/** 独立预览窗口页：同源自包含 HTML，脱开应用弹窗后可拖到系统任意位置。 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** 独立预览窗口路径；桌面壳据此放行同源新窗口。 */
export const PREVIEW_WINDOW_PATH = '/yuanshu-doclib/window'

/** 页面自包含样式与脚本，禁止外部资源，只允许内联脚本与同源请求。 */
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
  + "img-src 'self' blob: data:; frame-src blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"

/** 预览窗口注入参数：文件 ID、展示名与 MIME。 */
interface PreviewWindowFile {
  readonly id: string
  readonly name: string
  readonly mime: string
}

/**
 * 生成独立预览窗口 HTML：类型判定、字节读取、Office 转 PDF 与下载全部在页面内完成。
 * @param file - 文件标识与展示信息。
 * @returns 自包含 HTML，脚本中注入的数据已转义 `<`。
 */
export function previewWindowHtml(file: PreviewWindowFile): string {
  // 内联到脚本里的 JSON 必须转义 `<`，避免文件名中的 </script> 提前闭合脚本块。
  const payload = JSON.stringify(file).replace(/</gu, '\\u003c')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>文件预览</title>
<style>
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body { display: flex; flex-direction: column; background: #f6f7f9; color: #1f2328;
  font: 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
header { display: flex; flex: none; align-items: center; gap: 8px; padding: 10px 14px;
  border-bottom: 0.5px solid #d9dde3; background: #fff; }
.badge { flex: none; padding: 1px 6px; border-radius: 4px; background: #eef1f5; color: #57606a;
  font-size: 11px; font-weight: 600; letter-spacing: 0.02em; }
h1 { flex: 1 1 auto; min-width: 0; margin: 0; overflow: hidden; color: #1f2328; font-size: 13px;
  font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; flex: none; gap: 8px; }
button { padding: 4px 10px; border: 0.5px solid #c9cfd6; border-radius: 6px; background: #fff;
  color: #1f2328; font-size: 12px; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
#close { padding: 2px 6px; border-color: transparent; background: transparent; font-size: 16px; line-height: 1; }
main { display: flex; flex: 1 1 auto; align-items: center; justify-content: center; min-height: 0;
  padding: 12px 14px; overflow: auto; }
iframe.frame { width: 100%; height: 100%; border: 0; border-radius: 8px; background: #fff; }
img.media { max-width: 100%; max-height: 100%; border-radius: 8px; background: #fff; object-fit: contain; }
pre.text { align-self: stretch; width: 100%; max-height: 100%; margin: 0; padding: 12px 14px; overflow: auto;
  border: 1px solid #e2e6eb; border-radius: 8px; background: #fff;
  font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap;
  overflow-wrap: anywhere; }
p.state { margin: 0; color: #57606a; }
.fallback { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px; text-align: center; }
.note { margin: 8px 0 0; color: #57606a; font-size: 12px; }
footer { flex: none; padding: 8px 14px; border-top: 0.5px solid #d9dde3; background: #fff;
  color: #57606a; font-size: 12px; }
#search { display: flex; flex: none; align-items: center; gap: 6px; padding: 8px 14px;
  border-bottom: 0.5px solid #d9dde3; background: #fff; }
#search[hidden] { display: none; }
#search input { flex: 1 1 auto; min-width: 0; height: 26px; padding: 0 8px;
  border: 0.5px solid #c9cfd6; border-radius: 6px; font-size: 12px; }
#search input:focus-visible { border-color: #2f6feb; outline: none; }
#search .count { flex: none; color: #57606a; font-size: 11px; white-space: nowrap; }
#search button { min-width: 24px; height: 24px; padding: 0 6px; }
#search button[aria-pressed='true'] { border-color: #2f6feb; color: #2f6feb; }
mark.hit { border-radius: 2px; background: #f7d774; color: inherit; }
mark.hit.active { background: #ff9f1a; color: #1f2328; }
</style>
</head>
<body>
<header>
  <span class="badge" id="badge">文件</span>
  <h1 id="title"></h1>
  <div class="actions">
    <button type="button" id="download">下载</button>
    <button type="button" id="close" title="关闭">×</button>
  </div>
</header>
<div id="search" role="search" hidden>
  <input id="searchInput" type="text" placeholder="在文件中搜索" aria-label="在文件中搜索">
  <span class="count" id="searchCount" aria-live="polite"></span>
  <button type="button" id="searchPrev" aria-label="上一个匹配" title="上一个匹配">↑</button>
  <button type="button" id="searchNext" aria-label="下一个匹配" title="下一个匹配">↓</button>
  <button type="button" id="searchCase" aria-label="区分大小写" title="区分大小写" aria-pressed="false">Aa</button>
  <button type="button" id="searchClose" aria-label="关闭搜索" title="关闭搜索">×</button>
</div>
<main id="content"><p class="state">正在准备预览…</p></main>
<footer id="hint">可拖动窗口标题栏移到应用窗口之外；按 Esc 关闭。</footer>
<script>
(function () {
  var FILE = ${payload};
  var token = localStorage.getItem('workbench-client-token');
  var auth = {
    authorization: 'Bearer ' + token,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') || ''
  };
  var content = document.getElementById('content');
  var downloadBtn = document.getElementById('download');
  var hint = document.getElementById('hint');
  var name = FILE.name || '未命名文件';
  var mime = (FILE.mime || '').toLowerCase();
  var ext = (name.split('.').pop() || '').toLowerCase();
  var IMAGE = ['png','jpg','jpeg','gif','webp','svg','bmp','avif','ico','tif','tiff'];
  var TEXT = ['txt','md','markdown','json','xml','yaml','yml','log','csv','tsv','ini','conf','toml','env','url',
    'ts','tsx','js','jsx','mjs','cjs','py','go','rs','java','kt','c','h','cpp','hpp','cs','rb','php','sh','bash',
    'zsh','sql','html','htm','css','scss','less','vue','svelte','diff','patch'];
  var OFFICE = ['doc','docx','xls','xlsx','ppt','pptx'];
  var MAX_TEXT = 200000;
  /** 单次高亮的匹配上限，避免大文件生成过多节点。 */
  var MAX_HITS = 1000;
  var objectUrl = null;
  var controller = null;
  var searchEl = document.getElementById('search');
  var searchInput = document.getElementById('searchInput');
  var searchCount = document.getElementById('searchCount');
  var searchCaseBtn = document.getElementById('searchCase');
  var searchPrevBtn = document.getElementById('searchPrev');
  var searchNextBtn = document.getElementById('searchNext');
  // 文本搜索状态：currentText 为已截断的展示文本，hits 最多保留 1000 处高亮。
  var currentText = null;
  var hits = { matches: [], total: 0 };
  var activeHit = -1;
  var searchCase = false;
  var searchTruncated = false;
  var preEl = null;
  document.title = name;
  document.getElementById('title').textContent = name;
  document.getElementById('title').title = name;
  document.getElementById('badge').textContent = ext ? ext.toUpperCase() : '文件';

  function mode() {
    if (ext === 'pdf' || mime.indexOf('pdf') !== -1) return 'pdf';
    if (IMAGE.indexOf(ext) !== -1 || mime.indexOf('image/') === 0) return 'image';
    if (TEXT.indexOf(ext) !== -1 || mime.indexOf('text/') === 0 || mime === 'application/json'
      || mime.slice(-5) === '+json' || mime === 'application/xml' || mime.slice(-4) === '+xml') return 'text';
    if (OFFICE.indexOf(ext) !== -1
      || /msword|ms-excel|ms-powerpoint|wordprocessingml|spreadsheetml|presentationml/.test(mime)) return 'office';
    return 'none';
  }
  function fail(status) {
    content.replaceChildren();
    var box = document.createElement('div'); box.className = 'fallback';
    var text = document.createElement('p');
    if (status === 401) text.textContent = '登录已过期，请回到工作台重新登录后再试。';
    else if (status) text.textContent = '预览加载失败（HTTP ' + status + '），可重试或直接下载。';
    else text.textContent = '预览加载失败，可重试或直接下载。';
    box.appendChild(text);
    if (status !== 401) {
      var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试';
      retry.onclick = load; box.appendChild(retry);
    }
    content.appendChild(box);
    hint.textContent = '无法预览时请下载原始文件。';
  }
  function raw(signal) {
    if (!token) return Promise.reject({ status: 401 });
    return fetch('/yuanshu-doclib/files/' + encodeURIComponent(FILE.id) + '/preview', { headers: auth, signal: signal })
      .then(function (res) {
        if (!res.ok) throw { status: res.status };
        return res.blob();
      });
  }
  function converted(signal) {
    return raw(signal).then(function (blob) {
      return fetch('/yuanshu-doclib/office/pdf?ext=' + encodeURIComponent(ext), {
        method: 'POST', headers: Object.assign({ 'content-type': 'application/octet-stream' }, auth),
        body: blob, signal: signal
      }).then(function (res) {
        if (!res.ok) throw { status: res.status };
        return res.blob();
      });
    });
  }
  function decode(buffer) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (error) { /* 继续尝试 GB18030 */ }
    try { return new TextDecoder('gb18030').decode(buffer); } catch (error) { /* 回退宽松 UTF-8 */ }
    return new TextDecoder('utf-8').decode(buffer);
  }
  function showBlob(kind, blob) {
    if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    content.replaceChildren();
    if (kind === 'image') {
      var img = document.createElement('img');
      img.className = 'media'; img.alt = name; img.src = objectUrl;
      content.appendChild(img);
    } else {
      var frame = document.createElement('iframe');
      frame.className = 'frame'; frame.title = kind === 'office' ? 'Office 预览' : 'PDF 预览'; frame.src = objectUrl;
      content.appendChild(frame);
    }
    hint.textContent = '可拖动窗口标题栏移到应用窗口之外；按 Esc 关闭。';
  }
  // 按字面量查找全部匹配：matches 只保留前 MAX_HITS 处，total 用于展示真实命中数。
  function findHits(source, query) {
    var result = { matches: [], total: 0 };
    if (!query) return result;
    var haystack = searchCase ? source : source.toLowerCase();
    var needle = searchCase ? query : query.toLowerCase();
    var from = 0;
    for (;;) {
      var at = haystack.indexOf(needle, from);
      if (at === -1) break;
      result.total += 1;
      if (result.matches.length < MAX_HITS) result.matches.push({ start: at, end: at + needle.length });
      from = at + Math.max(needle.length, 1);
    }
    return result;
  }
  function updateSearchCount() {
    if (searchEl.hidden || searchInput.value === '') { searchCount.textContent = ''; return; }
    if (hits.total === 0) { searchCount.textContent = '无匹配'; return; }
    var total = hits.total > hits.matches.length ? hits.matches.length + '+' : String(hits.total);
    searchCount.textContent = '第 ' + (activeHit + 1) + ' / ' + total + ' 个';
  }
  // 只滚动文本容器本身，避免带动外层页面。
  function scrollActive() {
    if (preEl === null || activeHit < 0) return;
    var mark = preEl.querySelector('mark.active');
    if (!mark) return;
    var box = preEl.getBoundingClientRect();
    var rect = mark.getBoundingClientRect();
    if (rect.top < box.top || rect.bottom > box.bottom) {
      preEl.scrollTop += rect.top - box.top - (box.height - rect.height) / 2;
    }
  }
  function paintHits() {
    var marks = preEl === null ? [] : preEl.querySelectorAll('mark.hit');
    for (var i = 0; i < marks.length; i++) {
      marks[i].className = i === activeHit ? 'hit active' : 'hit';
    }
    scrollActive();
  }
  // 按当前关键字重建正文：普通片段为文本节点，命中片段包一层 mark 高亮。
  function renderText() {
    if (currentText === null) return;
    hits = findHits(currentText, searchEl.hidden ? '' : searchInput.value);
    if (hits.matches.length === 0) activeHit = -1;
    else if (activeHit < 0 || activeHit >= hits.matches.length) activeHit = 0;
    content.replaceChildren();
    var pre = document.createElement('pre');
    pre.className = 'text';
    var cursor = 0;
    for (var i = 0; i < hits.matches.length; i++) {
      var hit = hits.matches[i];
      if (hit.start > cursor) pre.appendChild(document.createTextNode(currentText.slice(cursor, hit.start)));
      var mark = document.createElement('mark');
      mark.className = i === activeHit ? 'hit active' : 'hit';
      mark.textContent = currentText.slice(hit.start, hit.end);
      pre.appendChild(mark);
      cursor = hit.end;
    }
    pre.appendChild(document.createTextNode(currentText.slice(cursor)));
    content.appendChild(pre);
    preEl = pre;
    if (searchTruncated) {
      var note = document.createElement('p');
      note.className = 'note';
      note.textContent = '仅显示前 ' + MAX_TEXT + ' 个字符，下载后可查看完整内容。';
      content.appendChild(note);
    }
    updateSearchCount();
    scrollActive();
  }
  function stepHit(delta) {
    if (hits.matches.length === 0) return;
    activeHit = (Math.max(activeHit, 0) + delta + hits.matches.length) % hits.matches.length;
    paintHits();
    updateSearchCount();
  }
  function openSearch() {
    if (currentText === null) return;
    searchEl.hidden = false;
    searchInput.focus();
    searchInput.select();
    renderText();
  }
  function closeSearch() {
    searchEl.hidden = true;
    searchInput.value = '';
    activeHit = -1;
    if (currentText !== null) renderText();
  }
  function showText(blob) {
    return blob.arrayBuffer().then(function (buffer) {
      var text = decode(buffer);
      searchTruncated = text.length > MAX_TEXT;
      currentText = searchTruncated ? text.slice(0, MAX_TEXT) : text;
      searchEl.hidden = true;
      searchInput.value = '';
      activeHit = -1;
      renderText();
      hint.textContent = '按 Ctrl/⌘+F 搜索文件内容；按 Esc 关闭。';
    });
  }
  function showUnsupported() {
    content.replaceChildren();
    var box = document.createElement('div'); box.className = 'fallback';
    var text = document.createElement('p');
    text.textContent = '该文件类型暂不支持应用内预览，请下载后用本地应用打开。';
    box.appendChild(text); content.appendChild(box);
    hint.textContent = '点击右上角「下载」保存原始文件。';
  }
  function load() {
    if (controller !== null) controller.abort();
    controller = new AbortController();
    // 换文件或重试时清空搜索状态，避免旧关键字命中新内容。
    currentText = null;
    preEl = null;
    hits = { matches: [], total: 0 };
    activeHit = -1;
    searchEl.hidden = true;
    searchInput.value = '';
    var kind = mode();
    if (kind === 'none') { showUnsupported(); return; }
    content.replaceChildren();
    var loading = document.createElement('p');
    loading.className = 'state'; loading.textContent = '正在准备预览…';
    content.appendChild(loading);
    hint.textContent = '';
    var job = kind === 'text' ? raw(controller.signal).then(showText)
      : (kind === 'office' ? converted(controller.signal) : raw(controller.signal))
        .then(function (blob) { showBlob(kind, blob); });
    job.catch(function (error) {
      if (controller.signal.aborted) return;
      fail(error && error.status ? error.status : 0);
    });
  }
  downloadBtn.onclick = function () {
    if (downloadBtn.disabled) return;
    downloadBtn.disabled = true;
    hint.textContent = '正在下载…';
    raw().then(function (blob) {
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url; link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      hint.textContent = '已开始下载原始文件。';
    }).catch(function () {
      hint.textContent = '下载失败，请稍后重试。';
    }).then(function () { downloadBtn.disabled = false; });
  };
  document.getElementById('close').onclick = function () { window.close(); };
  searchPrevBtn.onclick = function () { stepHit(-1); };
  searchNextBtn.onclick = function () { stepHit(1); };
  document.getElementById('searchClose').onclick = function () { closeSearch(); };
  searchCaseBtn.onclick = function () {
    searchCase = !searchCase;
    searchCaseBtn.setAttribute('aria-pressed', searchCase ? 'true' : 'false');
    activeHit = -1;
    renderText();
  };
  searchInput.addEventListener('input', function () {
    activeHit = -1;
    renderText();
  });
  searchInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      stepHit(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSearch();
    }
  });
  window.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && (event.key === 'f' || event.key === 'F')) {
      if (currentText !== null) { event.preventDefault(); openSearch(); }
      return;
    }
    if (event.key === 'Escape') {
      if (!searchEl.hidden) closeSearch();
      else window.close();
    }
  });
  window.addEventListener('beforeunload', function () { if (objectUrl !== null) URL.revokeObjectURL(objectUrl); });
  load();
})();
</script>
</body>
</html>`
}

/**
 * 处理独立预览窗口请求：不需要令牌即可取回页面，页面内的数据请求仍带 Bearer。
 * @param req - 预览窗口请求。
 * @param res - 响应对象。
 */
export function handlePreviewWindow(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const id = (url.searchParams.get('id') ?? '').trim()
  if (id === '') {
    res.writeHead(400, { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' })
    res.end('missing preview file id')
    return
  }
  const html = previewWindowHtml({
    id,
    name: url.searchParams.get('name') ?? '',
    mime: url.searchParams.get('mime') ?? '',
  })
  res.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  res.end(html)
}
