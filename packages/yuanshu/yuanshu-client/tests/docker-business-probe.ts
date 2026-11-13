/** Actual DSH SDK to original platform handlers, dispatcher and Docker runtime. */
import assert from 'node:assert/strict'
import { YuanShuMcp } from '../src/mcp.ts'
import type { YuanShuMcpGrant } from '../src/mcp.ts'
import type { CallToolResult } from '@modelcontextprotocol/client'
import { ProtocolError } from '@modelcontextprotocol/client'

function data(result: CallToolResult): Record<string, unknown> {
  assert.equal(result.isError, undefined, JSON.stringify(result.structuredContent))
  const value = result.structuredContent as { data: Record<string, unknown> }
  assert(value.data)
  return value.data
}
function records(value: unknown): Record<string, unknown>[] {
  assert(Array.isArray(value), 'expected a platform record list')
  return value.map((item: unknown) => {
    assert(item !== null && typeof item === 'object' && !Array.isArray(item), 'expected a platform record')
    return item as Record<string, unknown>
  })
}
async function main(): Promise<void> {
  const resource = process.env.MCP_PROBE_URL
  assert(resource)
  const actors = JSON.parse(process.env.MCP_PROBE_ACTORS ?? '[]') as Array<{ token: string }>
  const open = (index: number): YuanShuMcp => {
    const grant: YuanShuMcpGrant = { accessToken: actors[index]!.token, refreshToken: 'unused', expiresAt: Date.now() + 300_000, issuer: 'http://localhost:18091', resource, clientId: 'dsh' }
    return new YuanShuMcp({ resource, issuer: grant.issuer, clientId: 'dsh', redirectUri: 'http://localhost:3000/callback', timeoutMs: 5000, credentials: { read: async () => grant, write: async () => {} } })
  }
  let client = open(0)
  const name = 'algorithm_991001_execute'
  try {
    const position = data(await client.call('workbench_position', {}))
    assert.equal(position.position, 'procurement', 'the platform must derive the procurement role')
    const decisions = records(data(await client.call('workbench_decisions', {})).items)
    const arrival = decisions.find(item => item.record_code === 'MCP-ARR-001')
    assert(arrival && arrival.kind === 'arrival_pending', 'the real procurement arrival is missing')
    assert(!JSON.stringify(decisions).includes('MCP-ARR-SECRET'), 'workbench leaked another project')
    const arrivalRecords = data(await client.call('workbench_records', { domain: 'arrivals', page_size: 20 }))
    assert(JSON.stringify(arrivalRecords).includes('MCP-ARR-001'))
    assert(!JSON.stringify(arrivalRecords).includes('MCP-ARR-SECRET'))
    process.stdout.write('DSH_MCP_SHAOSHI_PROCUREMENT_PASS platform_role=true real_postgres_arrival=true record_read=true foreign_project_denied=true\n')
    const tool = (await client.tools()).find(tool => tool.name === name)
    assert(tool)
    const revisionProperty = tool.inputSchema.properties?.revision_id
    assert(revisionProperty !== undefined && revisionProperty !== null && typeof revisionProperty === 'object' && 'const' in revisionProperty)
    const revision = revisionProperty.const
    assert(typeof revision === 'number')
    const args = { input_data: { values: [10, 20, 30], delay: 0.2 }, revision_id: revision, idempotency_key: 'mcp-real-docker-1' }
    const execution = data(await client.call(name, args)).execution as { execution_id: string }
    assert(execution.execution_id)
    const replay = data(await client.call(name, args)).execution as { execution_id: string }
    assert.equal(replay.execution_id, execution.execution_id)
    const conflictingReplay = await client.call(name, { ...args, input_data: { values: [10, 20, 31], delay: 0.2 } })
    assert.equal(conflictingReplay.isError, true, 'reusing an idempotency key with changed input must conflict')
    await client.close()
    client = open(0)
    let run: { status?: string; output_snapshot?: unknown; asset_revision_id?: number } = {}
    for (let i = 0; i < 100; i++) {
      run = data(await client.call('execution_get', { executionID: execution.execution_id })).run as typeof run
      if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(run.status ?? '')) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(run.status, 'SUCCEEDED', JSON.stringify(run))
    assert.deepEqual(run.output_snapshot, { count: 3, sum: 60 })
    assert.equal(run.asset_revision_id, revision)
    const procurementQuery = { consumer_id: 'mcp-procurement-991006', consumer_type: 'knowledge_app', release_id: 991006, object_type: 'ProcurementLine', fields: ['line_id', 'project_code', 'deviation_mm', 'status'], sort: 'line_id', limit: 20 }
    const procurement = data(await client.call('ontology_objects_query', procurementQuery))
    assert.equal(procurement.release_id, 991006)
    const procurementRows = records(procurement.rows)
    assert.deepEqual(procurementRows, [
      { line_id: 1, project_code: 'MCP-PROC-001', deviation_mm: 0.1, status: 'pending_inspection' },
      { line_id: 2, project_code: 'MCP-PROC-001', deviation_mm: 0.3, status: 'pending_inspection' },
      { line_id: 3, project_code: 'MCP-PROC-001', deviation_mm: 0.15, status: 'pending_inspection' },
    ], 'real procurement rows differ from independently specified golden')
    const rowBypass = data(await client.call('ontology_objects_query', { ...procurementQuery, logic: 'or', filters: [{ field: 'project_code', op: 'eq', value: 'MCP-OTHER-SECRET' }, { field: 'line_id', op: 'gt', value: 0 }] }))
    assert.deepEqual(rowBypass.rows, procurementRows, 'caller OR filters bypassed platform row policy')
    const forbiddenField = await client.call('ontology_objects_query', { ...procurementQuery, fields: ['internal_cost'] })
    assert.equal(forbiddenField.isError, true, 'forbidden procurement property must be denied')
    const unboundRelease = await client.call('ontology_objects_query', { ...procurementQuery, release_id: 991007 })
    assert.equal(unboundRelease.isError, true, 'caller must not select an unbound release')
    process.stdout.write('DSH_MCP_PROCUREMENT_QUERY_PASS real_postgres=true published_projection=true independent_golden=true mandatory_row_filter=true field_denial=true release_denial=true\n')
    const resources = await client.resources()
    const instructions = resources.find(item => item.uri.startsWith('yuanshu://skills/991004/'))
    assert(instructions, 'published resource Skill was not discovered')
    const skillText = await client.resource(instructions.uri)
    assert(JSON.stringify(skillText).includes('MCP-PROCUREMENT-RESOURCE-V1'), 'resource Skill did not return its frozen instructions')
    const skillTools = await client.tools()
    assert(!skillTools.some(item => item.name === 'skill_991004_execute'), 'resource Skill must never expose a direct execution tool')
    const executableSkill = skillTools.find(item => item.name === 'skill_991005_execute')
    assert(executableSkill, 'published executable Skill was not discovered')
    const skillRevision = executableSkill.inputSchema.properties?.revision_id
    assert(skillRevision !== undefined && skillRevision !== null && typeof skillRevision === 'object' && 'const' in skillRevision && typeof skillRevision.const === 'number')
    const skillArgs = { input_data: { values: [4, 5, 6] }, revision_id: skillRevision.const, idempotency_key: 'mcp-real-skill-1' }
    const skillExecution = data(await client.call(executableSkill.name, skillArgs)).execution as { execution_id: string }
    assert(skillExecution.execution_id)
    const skillReplay = data(await client.call(executableSkill.name, skillArgs)).execution as { execution_id: string }
    assert.equal(skillReplay.execution_id, skillExecution.execution_id)
    let skillRun: typeof run = {}
    for (let attempt = 0; attempt < 100; attempt++) {
      skillRun = data(await client.call('execution_get', { executionID: skillExecution.execution_id })).run as typeof run
      if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(skillRun.status ?? '')) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(skillRun.status, 'SUCCEEDED', JSON.stringify(skillRun))
    assert.deepEqual(skillRun.output_snapshot, { count: 3, sum: 15 })
    assert.equal(skillRun.asset_revision_id, skillRevision.const)
    const deniedSkillReader = open(2)
    try {
      assert(!(await deniedSkillReader.resources()).some(item => item.uri === instructions.uri))
      await assert.rejects(deniedSkillReader.resource(instructions.uri))
    } finally { await deniedSkillReader.close() }
    process.stdout.write('DSH_MCP_SKILLS_PASS resource_instructions=true resource_not_executable=true executable_docker_terminal=true frozen_draft_contract=true cross_tenant_denied=true idempotent=true\n')
    const stale = await client.call(name, { ...args, revision_id: revision + 999 })
    assert.equal(stale.isError, true)
    for (let i = 1; i < 4; i++) {
      const other = open(i)
      try {
        assert(!(await other.tools()).some(tool => tool.name === name))
        await assert.rejects(other.call(name, args), error => error instanceof ProtocolError && /unknown tool/.test(error.message))
        assert.equal((await other.call('execution_get', { executionID: execution.execution_id })).isError, true)
      } finally { await other.close() }
    }
    const templates = await client.resourceTemplates()
    assert(templates.some(item => item.uriTemplate === 'yuanshu://knowledge/{id}'))
    const evidence = await client.call('knowledge_search', { query: 'Q-001', collection_ids: [991002], limit: 5 })
    assert(!evidence.isError, JSON.stringify(evidence))
    assert(JSON.stringify(evidence).includes('mcp-quality-q001-section3-991002'), JSON.stringify(evidence))
    const document = await client.resource('yuanshu://knowledge/991002')
    assert(JSON.stringify(document).includes('Q-001'))
    const toleranceMatch = /不得超过([0-9.]+)毫米/u.exec(JSON.stringify(document))
    assert(toleranceMatch, 'quality evidence must contain the actual tolerance')
    const tolerance = Number(toleranceMatch[1])
    assert.equal(tolerance, 0.2)
    const evaluatedInput = { values: procurementRows.map(row => row.deviation_mm), tolerance_mm: tolerance }
    const qualityExecution = data(await client.call(name, { input_data: evaluatedInput, revision_id: revision, idempotency_key: 'mcp-procurement-quality-1' })).execution as { execution_id: string }
    let qualityRun: typeof run = {}
    for (let attempt = 0; attempt < 100; attempt++) {
      qualityRun = data(await client.call('execution_get', { executionID: qualityExecution.execution_id })).run as typeof run
      if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(qualityRun.status ?? '')) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(qualityRun.status, 'SUCCEEDED', JSON.stringify(qualityRun))
    assert.deepEqual(qualityRun.output_snapshot, { count: 3, sum: 0.55, tolerance_mm: 0.2, failed_count: 1, inspection_required: true }, 'quality evaluation must use actual query rows and source tolerance')
    const workflow = (await client.tools()).find(item => item.name === 'dag_991003_execute')
    assert((await client.tools()).some(item => item.name === 'workbench_describe'))
    const otherTenant = open(2)
    try {
      const profile = await otherTenant.call('workbench_describe', {})
      assert(!profile.isError, JSON.stringify(profile))
      assert(JSON.stringify(profile.structuredContent).includes('manufacturing'))
      const overview = await otherTenant.call('workbench_home', {})
      assert(!overview.isError, JSON.stringify(overview))
      assert(JSON.stringify(overview.structuredContent).includes('Q-2026-0818-006'))
    } finally { await otherTenant.close() }
    const procurementProfile = await client.call('workbench_describe', {})
    assert(!procurementProfile.isError, JSON.stringify(procurementProfile))
    assert(JSON.stringify(procurementProfile.structuredContent).includes('shaoshi'))
    process.stdout.write('DSH_MCP_WORKBENCH_PASS shaoshi_descriptor=true manufacturing_postgres=true tenant_bound_application=true\n')
    assert(workflow, 'published workflow was not discovered')
    const workflowRevision = workflow.inputSchema.properties?.revision_id
    assert(workflowRevision !== undefined && workflowRevision !== null && typeof workflowRevision === 'object' && 'const' in workflowRevision && typeof workflowRevision.const === 'number')
    const workflowArgs = { input: { input: { ...evaluatedInput, delay: 2 }, procurement_context: { arrival_id: arrival.record_id, project_code: 'MCP-PROC-001', release_id: procurement.release_id, evidence_uri: 'yuanshu://knowledge/991002', evidence_id: 'mcp-quality-q001-section3-991002', evaluation_execution_id: qualityExecution.execution_id, evaluation: qualityRun.output_snapshot } }, revision_id: workflowRevision.const, idempotency_key: 'mcp-workflow-approve-1', conversation_id: 'mcp-acceptance-session' }
    const accepted = await client.call('dag_991003_execute', workflowArgs)
    assert(!accepted.isError, JSON.stringify(accepted))
    const acceptedData = data(accepted)
    assert(typeof acceptedData.execution_id === 'string', JSON.stringify(acceptedData))
    const workflowID = acceptedData.execution_id
    await client.close()
    client = open(0)
    let pending: Record<string, unknown> | undefined
    for (let i = 0; i < 150; i++) {
      const result = await client.call('dag_approvals', { execution_id: workflowID })
      const rows = records(data(result))
      if (rows.length > 0) { pending = rows[0]; break }
      if (i === 149) process.stderr.write(JSON.stringify(await client.call('dag_queue_get', { execution_id: workflowID })))
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert(pending, 'workflow never reached approval')
    const id = String(pending.id)
    const unauthorized = await client.call('dag_approval_decide', { id, decision: 'approved', auto_resume: true, idempotency_key: 'mcp-wrong-approver' })
    assert(unauthorized.isError, 'non-designated manager approved the task')
    const approver = open(1)
    try {
      const decision = await approver.call('dag_approval_decide', { id, decision: 'approved', auto_resume: true, idempotency_key: 'mcp-approval-1' })
      assert(!decision.isError, JSON.stringify(decision))
      const resumed = data(decision)
      assert(!('resume_error' in resumed), JSON.stringify(resumed))
      assert(JSON.stringify(resumed).includes('succeeded'), JSON.stringify(resumed))
      assert((await approver.call('dag_approval_decide', { id, decision: 'approved', idempotency_key: 'mcp-approval-1' })).isError)
    } finally { await approver.close() }
    process.stdout.write(`DSH_MCP_WORKFLOW_PASS original_run=${workflowID} knowledge_evidence=true approval=true reconnect=true\n`)
    const allEvents = records(data(await client.call('dag_run_events', { execution_id: workflowID, after_seq: 0, limit: 1000 })).events)
    assert(allEvents.length > 3, 'workflow must persist actual execution events')
    const recoveredSequences: number[] = []
    let cursor = 0
    for (let page = 0; page < 100; page++) {
      const result = data(await client.call('dag_run_events', { execution_id: workflowID, after_seq: cursor, limit: 3 }))
      for (const item of records(result.events)) {
        assert(typeof item.sequence === 'number' && item.sequence > cursor)
        recoveredSequences.push(item.sequence)
      }
      assert(typeof result.next_sequence === 'number' && result.next_sequence >= cursor)
      cursor = result.next_sequence
      if (result.has_more !== true) break
      await client.close()
      client = open(0)
    }
    assert.deepEqual(recoveredSequences, allEvents.map(item => item.sequence), 'reconnecting cursor pages lost or duplicated original workflow events')
    assert.equal(new Set(recoveredSequences).size, recoveredSequences.length)
    process.stdout.write(`DSH_MCP_EVENT_RECOVERY_PASS original_run=${workflowID} events=${recoveredSequences.length} page_size=3 reconnect_between_pages=true duplicates=0\n`)
    const recoveredQuality = data(await client.call('execution_get', { executionID: qualityExecution.execution_id })).run as typeof run
    assert.deepEqual(recoveredQuality.output_snapshot, qualityRun.output_snapshot)
    assert.deepEqual(await client.resource('yuanshu://knowledge/991002'), document)
    const recoveredWorkflow = data(await client.call('dag_queue_get', { execution_id: workflowID }))
    assert(JSON.stringify(recoveredWorkflow).includes('succeeded'), JSON.stringify(recoveredWorkflow))
    assert(JSON.stringify(recoveredWorkflow).includes(qualityExecution.execution_id), 'the original workflow must preserve the evaluation association')
    process.stdout.write(`DSH_MCP_PROCUREMENT_VERTICAL_PASS arrival=MCP-ARR-001 project=MCP-PROC-001 rows=3 tolerance_mm=0.2 failed_count=1 evaluation_run=${qualityExecution.execution_id} workflow_run=${workflowID} source_evidence=true designated_approver=true original_task_recovered=true\n`)

    const control = async (operation: string): Promise<void> => {
      const response = await fetch(`${resource}/_fixture/${operation}`, { method: 'POST', headers: { Authorization: `Bearer ${actors[0]!.token}` } })
      assert(response.ok, `synthetic membership control failed: ${response.status}`)
    }
    await control('disable-approver')
    const revoked = open(1)
    try {
      await assert.rejects(revoked.call('dag_approvals', { execution_id: workflowID }), 'membership revoked after approval must reject the existing grant')
      assert(!JSON.stringify(data(await client.call('dag_queue_get', { execution_id: workflowID }))).includes('resume_error'))
    } finally { await revoked.close(); await control('enable-approver') }
    const rejectedID = data(await client.call('dag_991003_execute', { ...workflowArgs, idempotency_key: 'mcp-workflow-reject-1' })).execution_id
    assert(typeof rejectedID === 'string')
    let rejectionTask: Record<string, unknown> | undefined
    for (let i = 0; i < 150; i++) {
      const rows = records(data(await client.call('dag_approvals', { execution_id: rejectedID })))
      if (rows.length > 0) { rejectionTask = rows[0]; break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert(rejectionTask, 'rejection workflow never reached approval')
    await control('disable-approver')
    const pendingRevoked = open(1)
    try {
      await assert.rejects(pendingRevoked.call('dag_approval_decide', { id: String(rejectionTask.id), decision: 'approved', auto_resume: true, idempotency_key: 'mcp-revoked-approval' }))
      const unchanged = records(data(await client.call('dag_approvals', { execution_id: rejectedID })))
      assert(unchanged[0]?.status === 'pending', 'revoked decision changed the pending task')
    } finally { await pendingRevoked.close(); await control('enable-approver') }
    const rejecting = open(1)
    try {
      const decision = data(await rejecting.call('dag_approval_decide', { id: String(rejectionTask.id), decision: 'rejected', auto_resume: true, idempotency_key: 'mcp-rejection-1' }))
      assert(!('resume_error' in decision), JSON.stringify(decision))
      assert(JSON.stringify(decision).includes('rejected'), JSON.stringify(decision))
      assert(JSON.stringify(decision).includes('succeeded'), JSON.stringify(decision))
      const tasks = records(data(await client.call('dag_approvals', { execution_id: rejectedID, status: 'all' })))
      assert(tasks[0]?.decision === 'rejected' && tasks[0]?.status === 'decided', JSON.stringify(tasks))
      assert((await rejecting.call('dag_approval_decide', { id: String(rejectionTask.id), decision: 'approved', idempotency_key: 'mcp-rejection-repeat' })).isError)
    } finally { await rejecting.close() }
    process.stdout.write(`DSH_MCP_APPROVAL_NEGATIVE_PASS rejected_run=${rejectedID} rejected=true revoke_before_decision=true revoke_after_approval=true repeat_denied=true\n`)

    process.stdout.write(`DSH_MCP_DOCKER_BUSINESS_PASS result={"count":3,"sum":60} same_run_after_reconnect=true duplicate_submission=false pinned_revision=${revision}\n`)
  } finally { await client.close() }
}
void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1 })
