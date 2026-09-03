import type {
  YuanshuConfig,
  NLQueryRequest,
  NLQueryResponse,
  QARequest,
  QAStreamEvent,
  AgentExecuteRequest,
  AgentStreamEvent,
  MCPTool,
  Skill,
  Scenario
} from './types.js'

export class YuanshuClient {
  private baseUrl: string
  private apiKey?: string
  private timeout: number

  constructor(config: YuanshuConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.timeout = config.timeout ?? 30000
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers as Record<string, string>
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    const response = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(this.timeout)
    })

    if (!response.ok) {
      throw new Error(`Yuanshu API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async nlQuery(request: NLQueryRequest): Promise<NLQueryResponse> {
    return this.request<NLQueryResponse>('/ontology/nl-query', {
      method: 'POST',
      body: JSON.stringify(request)
    })
  }

  async qaAsk(request: QARequest): Promise<ReadableStream<QAStreamEvent>> {
    const url = `${this.baseUrl}/api/v1/knowledge-bases/qa/ask/stream`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      throw new Error(`Yuanshu QA error: ${response.status} ${response.statusText}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    return new ReadableStream({
      async start(controller) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6))
                controller.enqueue(event)
              } catch {
                // skip invalid JSON
              }
            }
          }
        }
        controller.close()
      }
    })
  }

  async agentExecute(request: AgentExecuteRequest): Promise<ReadableStream<AgentStreamEvent>> {
    const url = `${this.baseUrl}/api/v1/agent/execute-stream`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...request, stream: true })
    })

    if (!response.ok) {
      throw new Error(`Yuanshu Agent error: ${response.status} ${response.statusText}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    return new ReadableStream({
      async start(controller) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6))
                controller.enqueue(event)
              } catch {
                // skip invalid JSON
              }
            }
          }
        }
        controller.close()
      }
    })
  }

  async listMCPTools(): Promise<MCPTool[]> {
    const response = await this.request<{ data: MCPTool[] }>('/mcp-tool-registry')
    return response.data
  }

  async listSkills(): Promise<Skill[]> {
    const response = await this.request<{ data: Skill[] }>('/skills')
    return response.data
  }

  async listScenarios(): Promise<Scenario[]> {
    const response = await this.request<{ data: Scenario[] }>('/scenarios')
    return response.data
  }

  async executeSkill(skillId: string, params: Record<string, unknown>): Promise<unknown> {
    return this.request(`/skills/${skillId}/execute`, {
      method: 'POST',
      body: JSON.stringify(params)
    })
  }

  async runScenario(scenarioId: string, params: Record<string, unknown>): Promise<unknown> {
    return this.request(`/scenarios/${scenarioId}/runs`, {
      method: 'POST',
      body: JSON.stringify(params)
    })
  }
}
