import { YuanShuError } from '@deepseek-ai/dsh-yuanshu-client'
import { describe, expect, it } from 'vitest'
import { GatewayRequestError, allowedMethods, errorBody, errorStatus, isAllowedRoute } from '../src/routes.ts'

describe('gateway route table', () => {
  it.each([
    '/capabilities',
    '/tenants',
    '/user/me',
    '/login',
    '/execute',
    '/execute-stream',
    '/qa/ask',
    '/qa/sessions',
    '/knowledges',
    '/knowledges/12',
    '/workbench/profile',
    '/workbench/home',
    '/ontology/overview',
    '/ontology/spaces',
    '/ontology/collections',
    '/ontology/releases',
    '/scenarios',
    '/skills/7/execute',
    '/skills/skill-abc/executions',
    '/algorithms/3/execute',
    '/algorithms/3/executions',
    '/dag/definitions/flow-1/invoke',
    '/dag/history',
    '/dag/history/5',
  ])('allows %s', (path) => {
    expect(isAllowedRoute(path)).toBe(true)
  })

  it.each([
    // 前缀近似但未登记
    '/execute-anything',
    '/skills',
    '/skills/7',
    '/skills/7/execute/extra',
    '/algorithms/3/executions/9',
    '/dag/definitions/flow-1',
    '/dag/history/5/nodes',
    '/admin/users',
    '/agent/execute',
    '/workers/general_assistant/execute',
    '/knowledges/../../admin',
    '/knowledges/abc',
  ])('rejects %s', (path) => {
    expect(isAllowedRoute(path)).toBe(false)
  })

  it('fixes the HTTP method per route', () => {
    expect(allowedMethods('/capabilities')).toEqual(['GET'])
    expect(allowedMethods('/user/me')).toEqual(['GET'])
    expect(allowedMethods('/skills/7/execute')).toEqual(['POST'])
    expect(allowedMethods('/algorithms/3/executions')).toEqual(['POST', 'GET'])
    expect(allowedMethods('/dag/history/5')).toEqual(['GET'])
    expect(allowedMethods('/workbench/profile')).toEqual(['GET'])
    expect(allowedMethods('/workbench/home')).toEqual(['GET'])
    expect(allowedMethods('/ontology/overview')).toEqual(['GET'])
    expect(allowedMethods('/scenarios')).toEqual(['GET'])
    expect(allowedMethods('/unknown')).toBeUndefined()
  })
})

describe('gateway error mapping', () => {
  it('preserves YuanShu status and business code', () => {
    const error = new YuanShuError('skill not found', 404, 40401)
    expect(errorStatus(error)).toBe(404)
    expect(errorBody(error)).toEqual({ error: 'skill not found', code: 40401 })
  })

  it('keeps retryable statuses distinguishable', () => {
    expect(errorStatus(new YuanShuError('throttled', 429))).toBe(429)
    expect(errorStatus(new YuanShuError('unavailable', 503))).toBe(503)
    expect(errorStatus(new YuanShuError('unauthorized', 401))).toBe(401)
  })

  it('maps client mistakes to 400 and gateway faults to 502', () => {
    expect(errorStatus(new SyntaxError('Unexpected token'))).toBe(400)
    expect(errorStatus(new GatewayRequestError('input_artifact_ids must be an array of strings'))).toBe(400)
    expect(errorStatus(new Error('socket hang up'))).toBe(502)
  })

  it('returns a JSON error body without leaking unknown fields', () => {
    expect(errorBody(new Error('socket hang up'))).toEqual({ error: 'socket hang up' })
    expect(errorBody('boom')).toEqual({ error: 'boom' })
  })
})
