/** 验证主数据代理只放行已接入的资源方法。 */
import { expect, it } from 'vitest'
import { shaoshiMasterMethodAllowed } from '../src/master-data-proxy.ts'

it('放行物料读取、更新和软删除并拒绝未接入的方法', () => {
  expect(shaoshiMasterMethodAllowed('materials', 'GET', false)).toBe(true)
  expect(shaoshiMasterMethodAllowed('materials', 'PUT', true)).toBe(true)
  expect(shaoshiMasterMethodAllowed('materials', 'DELETE', true)).toBe(true)
  expect(shaoshiMasterMethodAllowed('materials', 'POST', false)).toBe(false)
  expect(shaoshiMasterMethodAllowed('materials', 'PUT', false)).toBe(false)
  expect(shaoshiMasterMethodAllowed('materials', 'DELETE', false)).toBe(false)
})

it('放行设备台账的完整读写并拒绝越界方法', () => {
  expect(shaoshiMasterMethodAllowed('equipments', 'GET', false)).toBe(true)
  expect(shaoshiMasterMethodAllowed('equipments', 'POST', false)).toBe(true)
  expect(shaoshiMasterMethodAllowed('equipments', 'GET', true)).toBe(true)
  expect(shaoshiMasterMethodAllowed('equipments', 'PUT', true)).toBe(true)
  expect(shaoshiMasterMethodAllowed('equipments', 'DELETE', true)).toBe(true)
  expect(shaoshiMasterMethodAllowed('equipments', 'POST', true)).toBe(false)
  expect(shaoshiMasterMethodAllowed('equipments', 'PUT', false)).toBe(false)
  expect(shaoshiMasterMethodAllowed('equipments', 'DELETE', false)).toBe(false)
})

it('云端已下线的合同与会议室资源不再放行', () => {
  for (const resource of ['contracts', 'meeting-rooms', 'meeting-room-bookings']) {
    expect(shaoshiMasterMethodAllowed(resource, 'GET', false)).toBe(false)
    expect(shaoshiMasterMethodAllowed(resource, 'POST', false)).toBe(false)
    expect(shaoshiMasterMethodAllowed(resource, 'PUT', true)).toBe(false)
  }
})
