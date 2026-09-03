export interface YuanshuConfig {
  baseUrl: string
  apiKey?: string
  timeout?: number
}

export interface NLQueryRequest {
  query: string
  runId?: number
  datasourceId?: number
}

export interface NLQueryResponse {
  sql: string
  columns: string[]
  rows: unknown[][]
  time_ms: number
  total: number
  explanation: string
  confidence: number
  tables_used: string[]
  nl_time_ms: number
}

export interface QARequest {
  question: string
  applicationId: string
  sessionId?: string
}

export interface QAChunk {
  content: string
  source?: string
  score?: number
}

export interface QAStreamEvent {
  type: 'chunk' | 'done' | 'error'
  content?: string
  chunks?: QAChunk[]
  error?: string
}

export interface AgentExecuteRequest {
  agentId: string
  message: string
  sessionId?: string
  stream?: boolean
}

export interface AgentStreamEvent {
  type: 'message' | 'tool_call' | 'tool_result' | 'done' | 'error'
  content?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: string
  error?: string
}

export interface WorkerExecuteRequest {
  workerName: string
  message: string
  sessionId?: string
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface Skill {
  id: string
  name: string
  description: string
  version: string
}

export interface Scenario {
  id: string
  name: string
  description: string
  status: string
}
