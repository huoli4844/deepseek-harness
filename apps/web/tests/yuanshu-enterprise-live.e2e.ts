/** Full YuanShu API and Docker browser acceptance with isolated synthetic accounts. */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium, type Browser, type Page } from 'playwright'
import { expect, it } from 'vitest'

const base = process.env.MCP_BROWSER_DSH_URL
const password = process.env.MCP_BROWSER_PASSWORD
const evidence = process.env.MCP_BROWSER_EVIDENCE_DIR
const enabled = base !== undefined && password !== undefined

async function login(browser: Browser, username: string, tenantCode: string, tenant: string): Promise<Page> {
  if (base === undefined || password === undefined || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Explicit loopback browser environment required')
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)
  await page.goto(new URL('/login', base).href)
  await page.getByPlaceholder('请输入所属租户代码').fill(tenantCode)
  await page.getByPlaceholder('请输入账号').fill(username)
  await page.getByPlaceholder('请输入登录密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'))
  await page.getByText('YuanShu', { exact: true }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('combobox', { name: 'Active tenant', exact: true }).selectOption(tenant)
  // A model account is optional for deterministic platform tools; dismiss its prompt normally.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Authorize enterprise access for this tenant', exact: true }).click()
  await page.getByRole('combobox', { name: 'Capability', exact: true }).waitFor()
  return page
}

async function screenshot(page: Page, name: string): Promise<void> {
  if (evidence === undefined) return
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, name), fullPage: true })
}

async function call(page: Page, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  await page.getByRole('combobox', { name: 'Capability', exact: true }).selectOption(name)
  await page.getByRole('textbox', { name: 'Input parameters (JSON, optional)', exact: true }).fill(JSON.stringify(args))
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/yuanshu-api/mcp/call')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const result = await response
  expect(result.status(), `${name}: ${result.status() === 200 ? 'ok' : await result.text()}`).toBe(200)
  return result.json() as Promise<Record<string, unknown>>
}

function data(result: Record<string, unknown>): Record<string, unknown> {
  expect(result.isError).not.toBe(true)
  const content = result.structuredContent as { data: Record<string, unknown> }
  expect(content.data).toBeDefined()
  return content.data
}

it.skipIf(!enabled)('reads real manufacturing records, preserves authorization on reload and revokes access', async () => {
  const browser = await chromium.launch()
  try {
    const page = await login(browser, 'mcp-browser', 'mcp-pg-fixture-1', '910002')
    await page.getByRole('button', { name: '质量事件', exact: true }).click()
    await page.getByRole('cell', { name: 'Q-2026-0818-006', exact: true }).waitFor()
    expect(await page.getByRole('cell', { name: 'Q-2026-0817-021', exact: true }).count()).toBe(1)
    await screenshot(page, 'manufacturing-light.png')
    await page.emulateMedia({ colorScheme: 'dark' })
    await screenshot(page, 'manufacturing-dark.png')
    await page.setViewportSize({ width: 768, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768)
    const textbox = await page.getByRole('textbox', { name: 'Input parameters (JSON, optional)', exact: true }).boundingBox()
    expect(textbox?.height).toBeGreaterThan(80)
    await screenshot(page, 'manufacturing-768.png')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.reload()
    await page.getByText('YuanShu', { exact: true }).click()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('heading', { name: '生产制造', exact: true }).waitFor()
    await page.getByRole('button', { name: '质量事件', exact: true }).click()
    await page.getByRole('cell', { name: 'Q-2026-0818-006', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Revoke enterprise access', exact: true }).click()
    await expect.poll(() => page.getByRole('combobox', { name: 'Capability', exact: true }).count()).toBe(0)
    console.log('DSH_MCP_BROWSER_MANUFACTURING_PASS login=true pkce=true postgres_records=2 reload=true revoke=true viewport=768')
  } finally { await browser.close() }
}, 120_000)

it.skipIf(!enabled)('approves a Docker-backed DAG as another user and restores the original Run after reload', async () => {
  const browser = await chromium.launch()
  try {
    const owner = await login(browser, 'mcp-pg-fixture-0', 'mcp-pg-fixture-0', '910001')
    const accepted = data(await call(owner, 'dag_991003_execute', { input: { input: { values: [10, 20, 30], delay: 2 } }, idempotency_key: `mcp-browser-${randomUUID()}`, conversation_id: 'mcp-browser-session' }))
    const executionID = accepted.execution_id
    expect(typeof executionID).toBe('string')
    let task: Record<string, unknown> | undefined
    await expect.poll(async () => {
      const rows = data(await call(owner, 'dag_approvals', { execution_id: executionID }))
      if (Array.isArray(rows) && rows.length > 0) {
        const candidate: unknown = rows[0]
        expect(candidate).not.toBeNull()
        expect(typeof candidate).toBe('object')
        if (candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)) task = candidate as Record<string, unknown>
      }
      return task?.status
    }, { timeout: 30_000 }).toBe('pending')
    const id = String(task?.id)
    const denied = await call(owner, 'dag_approval_decide', { id, decision: 'approved', auto_resume: true, idempotency_key: `mcp-browser-denied-${randomUUID()}` })
    expect(denied.isError).toBe(true)
    await owner.context().setOffline(true)
    try { await expect(owner.reload()).rejects.toThrow() }
    finally { await owner.context().setOffline(false) }
    await owner.goto(base!)
    await owner.getByText('YuanShu', { exact: true }).click()
    await owner.getByRole('button', { name: 'Close', exact: true }).click()
    const restored = owner.locator('section').filter({ has: owner.getByRole('heading', { name: 'Original platform Run', exact: true }) })
    await expect.poll(() => restored.innerText()).toContain(String(executionID))
    const approver = await login(browser, 'mcp-pg-fixture-1', 'mcp-pg-fixture-0', '910001')
    const input = await call(approver, 'dag_approval_decide', { id, auto_resume: true, idempotency_key: `mcp-browser-approval-${randomUUID()}` })
    expect(input.resultType).toBe('input_required')
    await approver.getByRole('combobox', { name: 'decision', exact: true }).selectOption('approved')
    const response = approver.waitForResponse(response => new URL(response.url()).pathname === '/yuanshu-api/mcp/call')
    await approver.getByRole('button', { name: 'Submit input', exact: true }).click()
    const decision = data(await (await response).json() as Record<string, unknown>)
    expect(decision).not.toHaveProperty('resume_error')
    expect(JSON.stringify(decision)).toContain('succeeded')
    await owner.reload()
    await owner.getByText('YuanShu', { exact: true }).click()
    await owner.getByRole('button', { name: 'Close', exact: true }).click()
    await owner.getByRole('heading', { name: 'Original platform Run', exact: true }).waitFor()
    const original = owner.locator('section').filter({ has: owner.getByRole('heading', { name: 'Original platform Run', exact: true }) })
    await expect.poll(() => original.innerText()).toContain(String(executionID))
    await expect.poll(() => original.innerText(), { timeout: 10_000 }).toMatch(/succeeded/i)
    await screenshot(owner, 'workflow-original-run-restored.png')
    await approver.getByRole('button', { name: 'Revoke enterprise access', exact: true }).click()
    await expect.poll(() => approver.getByRole('combobox', { name: 'Capability', exact: true }).count()).toBe(0)
    await owner.getByRole('button', { name: 'Revoke enterprise access', exact: true }).click()
    await expect.poll(() => owner.getByRole('combobox', { name: 'Capability', exact: true }).count()).toBe(0)
    console.log(`DSH_MCP_BROWSER_WORKFLOW_PASS original_run=${String(executionID)} docker=true separate_approver=true unauthorized_denied=true mrtr=true reload=true offline_recovery=true revoke=true`)
  } finally { await browser.close() }
}, 120_000)
