import { expect, it } from 'vitest'
import { equipmentCreatePayload, invalidEquipmentFields } from '../src/business-forms/equipment-contract.ts'
import { equipmentTemplate, parseEquipmentImport } from '../src/client/modules/business-modules/equipment-import.ts'

it('保留表格引号、换行及设备编码的前导零', () => {
  expect(parseEquipmentImport('\uFEFFcode,name,remark\r\n001,"设备, A","描述\n内含""引号"""\r\n')).toEqual([
    { line: 2, content: { code: '001', name: '设备, A', remark: '描述\n内含"引号"' } },
  ])
  expect(equipmentTemplate()).toMatch(/^\uFEFFcode,name,/u)
})

it('拒绝未知表头和错列，不发送无效日期或未定义的状态', () => {
  expect(() => parseEquipmentImport('code,name,user_id\n1,A,5')).toThrow()
  expect(() => parseEquipmentImport('code,name\n1,A,B')).toThrow()
  expect(invalidEquipmentFields({ code: 'A', purchase_date: '2026-02-30', lifecycle_status: 'working' }))
    .toEqual(['name', 'purchase_date', 'lifecycle_status'])
  expect(equipmentCreatePayload({ code: ' 001 ', name: ' A ', maint_interval_days: '7' }))
    .toEqual({ code: '001', name: 'A', maint_interval_days: 7 })
})

it('入职任务模板使用独立的必填列，拒绝设备列', () => {
  expect(equipmentTemplate('onboarding-task')).toContain('task_no,task_type,due_date,status')
  expect(parseEquipmentImport('task_no,task_type\n001,daily', ',', 'onboarding-task')).toEqual([
    { line: 2, content: { task_no: '001', task_type: 'daily' } },
  ])
  expect(() => parseEquipmentImport('task_no,task_type,code\n001,daily,A', ',', 'onboarding-task')).toThrow()
})

it('客户导入将能匹配的中文选项转为正式编码', () => {
  expect(parseEquipmentImport('code,name,level,status\n001,示例,重要客户,1（有效）', ',', 'customer')).toEqual([
    { line: 2, content: { code: '001', name: '示例', level: 'important', status: '1' } },
  ])
})
