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

/** English workbench labels and shared chart vocabulary. */
export const en = {
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
