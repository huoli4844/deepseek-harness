import { expect, it, vi } from 'vitest'
import { McpCapabilities } from '../src/mcp-capabilities.ts'

it('登录目录五分钟内复用，过期时合并并发刷新', async () => {
  let time = 0
  const now = () => time
  const cache = new McpCapabilities()
  const first = { toolNames: ['old'], truncated: false }
  const latest = { toolNames: ['new'], truncated: false }
  const load = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(latest)
  expect(await cache.read(load, now)).toEqual(first)
  time = 299_999
  expect(await cache.read(load, now)).toEqual(first)
  expect(load).toHaveBeenCalledTimes(1)
  time += 1
  expect(await Promise.all([cache.read(load, now), cache.read(load, now)])).toEqual([latest, latest])
  expect(load).toHaveBeenCalledTimes(2)
})

it('刷新失败时不会让后续错误持续请求目录', async () => {
  let time = 0
  const now = () => time
  const cache = new McpCapabilities()
  const load = vi.fn().mockRejectedValue(new Error('offline'))
  await cache.read(load, now)
  time = 500
  await cache.read(load, now)
  expect(load).toHaveBeenCalledTimes(1)
})
