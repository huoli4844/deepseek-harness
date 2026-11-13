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

function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
  return chromium.launch(executablePath === undefined ? {} : { executablePath })
}

async function configureModelLater(page: Page): Promise<void> {
  const welcome = page.getByRole('dialog', { name: 'Preview Notice', exact: true })
  const setup = page.getByRole('dialog', { name: 'Get started', exact: true })
  await welcome.or(setup).first().waitFor()
  if (await welcome.isVisible()) await welcome.getByRole('button', { name: 'Continue', exact: true }).click()
  await setup.getByRole('button', { name: 'Add API Key', exact: true }).click()
  await page.getByRole('dialog', { name: 'Add an API key to get started', exact: true })
    .getByRole('button', { name: 'Configure later', exact: true }).click()
}

async function login(browser: Browser, username: string, tenantCode: string, tenant: string): Promise<Page> {
  if (base === undefined || password === undefined || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Explicit loopback browser environment required')
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' })
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)
  await page.goto(new URL('/login', base).href)
  await page.getByPlaceholder('请输入所属租户代码').fill(tenantCode)
  await page.getByPlaceholder('请输入账号').fill(username)
  await page.getByPlaceholder('请输入登录密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'))
  await configureModelLater(page)
  await page.getByText('YuanShu', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Active tenant', exact: true }).selectOption(tenant)
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
  const browser = await launchBrowser()
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
    await configureModelLater(page)
    await page.getByText('YuanShu', { exact: true }).click()
    await page.getByRole('heading', { name: '生产制造', exact: true }).waitFor()
    await page.getByRole('button', { name: '质量事件', exact: true }).click()
    await page.getByRole('cell', { name: 'Q-2026-0818-006', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Revoke enterprise access', exact: true }).click()
    await expect.poll(() => page.getByRole('combobox', { name: 'Capability', exact: true }).count()).toBe(0)
    console.log('DSH_MCP_BROWSER_MANUFACTURING_PASS login=true pkce=true postgres_records=2 reload=true revoke=true viewport=768')
  } finally { await browser.close() }
}, 120_000)

it.skipIf(!enabled)('approves a Docker-backed DAG as another user and restores the original Run after reload', async () => {
  const browser = await launchBrowser()
  try {
    const owner = await login(browser, 'mcp-pg-fixture-0', 'mcp-pg-fixture-0', '910001')
    const position = data(await call(owner, 'workbench_position', {}))
    expect(position.position).toBe('procurement')
    const items = data(await call(owner, 'workbench_decisions', {})).items
    expect(Array.isArray(items)).toBe(true)
    expect(JSON.stringify(items)).toContain('MCP-ARR-001')
    expect(JSON.stringify(items)).not.toContain('MCP-ARR-SECRET')
    await screenshot(owner, 'procurement-pending-arrival.png')
    const procurement = data(await call(owner, 'ontology_objects_query', { consumer_id: 'mcp-procurement-991006', consumer_type: 'knowledge_app', release_id: 991006, object_type: 'ProcurementLine', fields: ['line_id', 'project_code', 'deviation_mm', 'status'], sort: 'line_id', limit: 20 }))
    expect(procurement.rows).toEqual([
      { line_id: 1, project_code: 'MCP-PROC-001', deviation_mm: 0.1, status: 'pending_inspection' },
      { line_id: 2, project_code: 'MCP-PROC-001', deviation_mm: 0.3, status: 'pending_inspection' },
      { line_id: 3, project_code: 'MCP-PROC-001', deviation_mm: 0.15, status: 'pending_inspection' },
    ])
    const source = data(await call(owner, 'knowledge_search', { query: 'Q-001', collection_ids: [991002], limit: 5 }))
    expect(JSON.stringify(source)).toContain('mcp-quality-q001-section3-991002')
    const match = /不得超过([0-9.]+)毫米/u.exec(JSON.stringify(source))
    expect(match).not.toBeNull()
    const tolerance = Number(match?.[1])
    expect(tolerance).toBe(0.2)
    const rows = procurement.rows as Array<{ deviation_mm: number }>
    const input = { values: rows.map(row => row.deviation_mm), tolerance_mm: tolerance, delay: 2 }
    const evaluated = data(await call(owner, 'algorithm_991001_execute', { input_data: input, idempotency_key: `mcp-browser-evaluation-${randomUUID()}` })).execution as { execution_id: string }
    let evaluation: unknown
    await expect.poll(async () => {
      const run = data(await call(owner, 'execution_get', { executionID: evaluated.execution_id })).run as { status: string; output_snapshot: unknown }
      evaluation = run.output_snapshot
      return run.status
    }, { timeout: 30_000 }).toBe('SUCCEEDED')
    expect(evaluation).toEqual({ count: 3, sum: 0.55, tolerance_mm: 0.2, failed_count: 1, inspection_required: true })
    await screenshot(owner, 'procurement-quality-evaluation.png')
    const accepted = data(await call(owner, 'dag_991003_execute', { input: { input, procurement_context: { project_code: 'MCP-PROC-001', evidence_uri: 'yuanshu://knowledge/991002', evidence_id: 'mcp-quality-q001-section3-991002', evaluation_execution_id: evaluated.execution_id, evaluation } }, idempotency_key: `mcp-browser-${randomUUID()}`, conversation_id: 'mcp-browser-session' }))
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
    await configureModelLater(owner)
    await owner.getByText('YuanShu', { exact: true }).click()
    const restored = owner.locator('section').filter({ has: owner.getByRole('heading', { name: 'Original platform Run', exact: true }) })
    await expect.poll(() => restored.innerText()).toContain(String(executionID))
    const approver = await login(browser, 'mcp-pg-fixture-1', 'mcp-pg-fixture-0', '910001')
    const supplemental = await call(approver, 'dag_approval_decide', { id, auto_resume: true, idempotency_key: `mcp-browser-approval-${randomUUID()}` })
    expect(supplemental.resultType).toBe('input_required')
    await approver.getByRole('combobox', { name: 'decision', exact: true }).selectOption('approved')
    const response = approver.waitForResponse(response => new URL(response.url()).pathname === '/yuanshu-api/mcp/call')
    await approver.getByRole('button', { name: 'Submit input', exact: true }).click()
    const decision = data(await (await response).json() as Record<string, unknown>)
    expect(decision).not.toHaveProperty('resume_error')
    expect(JSON.stringify(decision)).toContain('succeeded')
    await owner.reload()
    await configureModelLater(owner)
    await owner.getByText('YuanShu', { exact: true }).click()
    await owner.getByRole('heading', { name: 'Original platform Run', exact: true }).waitFor()
    const original = owner.locator('section').filter({ has: owner.getByRole('heading', { name: 'Original platform Run', exact: true }) })
    await expect.poll(() => original.innerText()).toContain(String(executionID))
    await expect.poll(() => original.innerText(), { timeout: 10_000 }).toMatch(/succeeded/i)
    await expect.poll(() => original.innerText()).toContain(evaluated.execution_id)
    await expect.poll(() => original.innerText()).toContain('mcp-quality-q001-section3-991002')
    await screenshot(owner, 'workflow-original-run-restored.png')
    const professionals = data(await call(owner, 'scenarios_list', { limit: 100 })).items as Array<{ id: number; revision_id: number }>
    const professional = professionals.find(item => item.id === 991010)
    expect(professional).toBeDefined()
    const delegated = data(await call(owner, 'agent_delegate', { agent_id: professional!.id, revision_id: professional!.revision_id, task: 'Evaluate procurement samples', session_id: 'browser-professional-parent', idempotency_key: `mcp-browser-professional-${randomUUID()}` }))
    await expect.poll(async () => data(await call(owner, 'run_get', { run_id: delegated.run_id })).status, { timeout: 30_000 }).toBe('succeeded')
    const scene = data(await call(owner, 'scenario_run', { agent_id: professional!.id, revision_id: professional!.revision_id, scenario_key: 'mcp-procurement-scenario-991020', scenario_version: '1.0.0', input_data: { values: [10, 20, 30], delay: 10 }, session_id: 'browser-scenario-parent', idempotency_key: `mcp-browser-scenario-${randomUUID()}` }))
    await expect.poll(async () => {
      const current = data(await call(owner, 'scenario_run_get', { run_id: scene.run_id }))
      const nodes = current.nodes as Array<{ status: string }>
      return nodes.some(node => node.status === 'RUNNING')
    }, { timeout: 15_000 }).toBe(true)
    await owner.reload()
    await configureModelLater(owner)
    await owner.getByText('YuanShu', { exact: true }).click()
    const scenePanel = owner.locator('section').filter({ has: owner.getByRole('heading', { name: 'Original platform Run', exact: true }) })
    await expect.poll(() => scenePanel.innerText()).toContain(String(scene.run_id))
    const cancellation = owner.waitForResponse(response => new URL(response.url()).pathname === '/yuanshu-api/mcp/call')
    await scenePanel.getByRole('button', { name: 'Request cancellation', exact: true }).click()
    const cancellationResponse = await cancellation
    expect(cancellationResponse.request().postDataJSON()).toMatchObject({ name: 'scenario_run_cancel' })
    expect(cancellationResponse.status()).toBe(200)
    await owner.reload()
    await configureModelLater(owner)
    await owner.getByText('YuanShu', { exact: true }).click()
    await expect.poll(() => scenePanel.innerText(), { timeout: 15_000 }).toContain('CANCELLED')
    await screenshot(owner, 'scenario-cancel-restored.png')
    console.log('DSH_MCP_BROWSER_PROFESSIONAL_SCENARIO_PASS professional_docker=true scenario_restore=true dedicated_cancel=true terminal_after_reload=true')
    await approver.getByRole('button', { name: 'Revoke enterprise access', exact: true }).click()
    await expect.poll(() => approver.getByRole('combobox', { name: 'Capability', exact: true }).count()).toBe(0)
    await owner.getByRole('button', { name: 'Revoke enterprise access', exact: true }).click()
    await expect.poll(() => owner.getByRole('combobox', { name: 'Capability', exact: true }).count()).toBe(0)
    console.log(`DSH_MCP_BROWSER_WORKFLOW_PASS original_run=${String(executionID)} procurement_postgres=true golden_rows=3 source_tolerance_mm=0.2 failed_count=1 evaluation_run=${evaluated.execution_id} docker=true separate_approver=true unauthorized_denied=true mrtr=true reload=true offline_recovery=true revoke=true`)
  } finally { await browser.close() }
}, 120_000)
