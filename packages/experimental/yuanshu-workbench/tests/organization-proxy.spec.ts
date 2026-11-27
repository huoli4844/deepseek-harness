/** 校验组织架构代理的路径映射与方法约束，不依赖实际后台。 */
import { expect, it } from 'vitest'
import { organizationProxyRoute } from '../src/organization-proxy.ts'

it('组织查询走固定路由，成员写按 ID 与后缀转发', () => {
  expect(organizationProxyRoute('/yuanshu-workbench/organization/departments/tree', 'GET')).toEqual({
    type: 'read', remote: '/api/v1/departments/tree',
  })
  expect(organizationProxyRoute('/yuanshu-workbench/organization/roles', 'GET')).toEqual({
    type: 'read', remote: '/api/v1/roles',
  })
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users', 'GET')).toEqual({
    type: 'read', remote: '/api/v1/users',
  })
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users/63', 'PUT')).toEqual({
    type: 'write', remote: '/api/v1/users/63',
  })
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users/63', 'DELETE')).toEqual({
    type: 'write', remote: '/api/v1/users/63',
  })
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users/63/status', 'PUT')).toEqual({
    type: 'write', remote: '/api/v1/users/63/status',
  })
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users/63/roles', 'POST')).toEqual({
    type: 'write', remote: '/api/v1/users/63/roles',
  })
})

it('查询路由仅允许 GET，成员写路由按后缀限定方法', () => {
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users', 'PUT')).toEqual({ type: 'method', allow: 'GET' })
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users/63', 'GET')).toEqual({
    type: 'method', allow: 'PUT, POST, DELETE',
  })
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users/63/status', 'POST')).toEqual({
    type: 'method', allow: 'PUT, POST, DELETE',
  })
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users/63/roles', 'PUT')).toEqual({
    type: 'method', allow: 'PUT, POST, DELETE',
  })
})

it('未知路径与带尾部斜杠的伪 ID 路径不映射', () => {
  expect(organizationProxyRoute('/yuanshu-workbench/organization/unknown', 'GET')).toBeUndefined()
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users/63/', 'PUT')).toBeUndefined()
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users/abc', 'PUT')).toBeUndefined()
  expect(organizationProxyRoute('/yuanshu-workbench/organization/users/63/unknown', 'PUT')).toBeUndefined()
})
