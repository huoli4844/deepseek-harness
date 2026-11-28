/** Typed workbench copy; Chinese and English share one key set. */
/** 文案按模块拆分：本文件只聚合各模块 locale 文件，不再存放内联键。 */
import { dashboardEn, dashboardZh } from '../../modules/dashboard/dashboard-locales.ts'
import { methodologyEn, methodologyZh } from './methodology-locales.ts'
import { positionOperationsEn, positionOperationsZh } from '../../modules/position-ops/position-operation-locales.ts'
import { workHomeEn, workHomeZh } from '../../modules/work-home/work-home-locales.ts'
import { changeDemoEn, changeDemoZh } from '../../modules/project-ops/change-demo-locales.ts'
import { milestoneEn, milestoneZh } from '../../modules/milestone-risk/milestone-risk-locales.ts'
import { operatorEn, operatorZh } from '../../operator/operator-locales.ts'
import { identityEn, identityZh } from '../../identity/identity-locales.ts'
import { liveEn, liveZh } from './live-locales.ts'
import { shellEn, shellZh } from './shell-locales.ts'
import { chartEn, chartZh } from './chart-locales.ts'
import { roleContentEn, roleContentZh } from './role-content-locales.ts'
import { taskWorkEn, taskWorkZh } from '../../modules/task-work/task-work-locales.ts'
import { calendarEn, calendarZh } from '../../modules/calendar/calendar-locales.ts'
import { groupsEn, groupsZh } from '../../modules/groups/groups-locales.ts'
import { assistantEn, assistantZh } from './assistant-locales.ts'
import { notificationsEn, notificationsZh } from '../../modules/notifications/notifications-locales.ts'
import { methodsEn, methodsZh } from './methods-locales.ts'
import { filesEn, filesZh } from '../../modules/files/files-locales.ts'
import { prioritiesEn, prioritiesZh } from '../../modules/priorities/priorities-locales.ts'
import { projectOpsEn, projectOpsZh } from '../../modules/project-ops/project-ops-locales.ts'
import { managementEn, managementZh } from './management-locales.ts'
import { customerResourcesEn, customerResourcesZh } from '../../modules/business-modules/customer-resources-locales.ts'
import { supplierManagementEn, supplierManagementZh } from '../../modules/business-modules/supplier-management-locales.ts'
import { recordListEn, recordListZh } from '../../modules/business-modules/record-list-locales.ts'
import { materialEn, materialZh } from '../../modules/business-modules/material-locales.ts'
import { equipmentEn, equipmentZh } from '../../modules/business-modules/equipment-locales.ts'
import { contractEn, contractZh } from '../../modules/business-modules/contract-locales.ts'
import { budgetEn, budgetZh } from '../../modules/business-modules/budget-locales.ts'
import { projectIntakeEn, projectIntakeZh } from '../../modules/business-modules/project-intake-locales.ts'
import { registrationEn, registrationZh } from '../../modules/business-modules/project-registration-locales.ts'
import { weeklyItemsEn, weeklyItemsZh } from '../../modules/business-modules/weekly-items-locales.ts'
import { organizationEn, organizationZh } from '../../modules/business-modules/organization-locales.ts'
import { meetingEn, meetingZh } from '../../modules/business-modules/meeting-locales.ts'
import { businessFormsEn, businessFormsZh } from '../../modules/business-forms/business-forms-locales.ts'
import { procurementChainEn, procurementChainZh } from '../../modules/procurement-chain/procurement-chain-locales.ts'

import { personalPagesEn, personalPagesZh } from '../../modules/personal-pages/personal-pages-locales.ts'
import { todosEn, todosZh } from '../../modules/todos/todos-locales.ts'

/** English workbench labels and shared chart vocabulary. */
export const en = {
  ...todosEn,
  ...personalPagesEn,
  ...businessFormsEn,
  ...procurementChainEn,
  ...liveEn,
  ...shellEn,
  ...chartEn,
  ...roleContentEn,
  ...taskWorkEn,
  ...calendarEn,
  ...groupsEn,
  ...assistantEn,
  ...notificationsEn,
  ...methodsEn,
  ...filesEn,
  ...prioritiesEn,
  ...projectOpsEn,
  ...managementEn,
  ...customerResourcesEn,
  ...supplierManagementEn,
  ...recordListEn,
  ...materialEn,
  ...equipmentEn,
  ...contractEn,
  ...budgetEn,
  ...projectIntakeEn,
  ...registrationEn,
  ...weeklyItemsEn,
  ...organizationEn,
  ...meetingEn,
  ...dashboardEn,
  ...methodologyEn,
  ...positionOperationsEn,
  ...workHomeEn,
  ...changeDemoEn,
  ...milestoneEn,
  ...operatorEn,
  ...identityEn,
} as const

/** Chinese copy; the key set mirrors `en` exactly. */
export const zh: Record<keyof typeof en, string> = {
  ...todosZh,
  ...personalPagesZh,
  ...businessFormsZh,
  ...procurementChainZh,
  ...liveZh,
  ...shellZh,
  ...chartZh,
  ...roleContentZh,
  ...taskWorkZh,
  ...calendarZh,
  ...groupsZh,
  ...assistantZh,
  ...notificationsZh,
  ...methodsZh,
  ...filesZh,
  ...prioritiesZh,
  ...projectOpsZh,
  ...managementZh,
  ...customerResourcesZh,
  ...supplierManagementZh,
  ...recordListZh,
  ...materialZh,
  ...equipmentZh,
  ...contractZh,
  ...budgetZh,
  ...projectIntakeZh,
  ...registrationZh,
  ...weeklyItemsZh,
  ...organizationZh,
  ...meetingZh,
  ...dashboardZh,
  ...methodologyZh,
  ...positionOperationsZh,
  ...workHomeZh,
  ...changeDemoZh,
  ...milestoneZh,
  ...operatorZh,
  ...identityZh,
}

/** Localized label keys used by demonstration fixtures. */
export type WorkbenchKey = keyof typeof en
