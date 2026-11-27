/** 校验技能市场代理的路径映射与方法约束，不依赖实际后台。 */
import { expect, it } from 'vitest'
import { skillsProxyRoute } from '../src/skills-proxy.ts'

it('三个列表路由只允许 GET', () => {
  expect(skillsProxyRoute('/yuanshu-skills/skills', 'GET')).toEqual({
    type: 'read', remote: '/api/v1/skills',
  })
  expect(skillsProxyRoute('/yuanshu-skills/skill-sources', 'GET')).toEqual({
    type: 'read', remote: '/api/v1/skill-sources',
  })
  expect(skillsProxyRoute('/yuanshu-skills/skill-packages', 'GET')).toEqual({
    type: 'read', remote: '/api/v1/skill-packages',
  })
  expect(skillsProxyRoute('/yuanshu-skills/skills', 'POST')).toEqual({ type: 'method', allow: 'GET' })
})

it('安装来源与导入包只允许 POST', () => {
  expect(skillsProxyRoute('/yuanshu-skills/skills/install-from-source', 'POST')).toEqual({
    type: 'write', remote: '/api/v1/skills/install-from-source',
  })
  expect(skillsProxyRoute('/yuanshu-skills/skills/import-package', 'POST')).toEqual({
    type: 'upload', remote: '/api/v1/skills/import-package',
  })
  expect(skillsProxyRoute('/yuanshu-skills/skills/import-package', 'GET')).toEqual({ type: 'method', allow: 'POST' })
  expect(skillsProxyRoute('/yuanshu-skills/skills/install-from-source', 'PUT')).toEqual({ type: 'method', allow: 'POST' })
})

it('导出包与客户端包按 ID 转发为二进制', () => {
  expect(skillsProxyRoute('/yuanshu-skills/skills/skill_01h9x/export-package', 'GET')).toEqual({
    type: 'binary', remote: '/api/v1/skills/skill_01h9x/export-package',
  })
  expect(skillsProxyRoute('/yuanshu-skills/skills/skill-42.v2/package', 'GET')).toEqual({
    type: 'binary', remote: '/api/v1/client/skills/skill-42.v2/package',
  })
  expect(skillsProxyRoute('/yuanshu-skills/skills/skill_01h9x/export-package', 'DELETE')).toEqual({
    type: 'method', allow: 'GET',
  })
})

it('未知路径与非法 ID 不转发', () => {
  expect(skillsProxyRoute('/yuanshu-skills/unknown', 'GET')).toBeUndefined()
  expect(skillsProxyRoute('/yuanshu-skills/skills/a%2Fb/export-package', 'GET')).toBeUndefined()
})
