/** 会议室与预约的类型定义，字段与后台契约保持一致。 */

/** 会议室状态集合，disabled 表示停用、不可预约。 */
export const roomStatuses = ['available', 'disabled'] as const

/** 会议室单条记录，时间字段由后台直接返回。 */
export interface MeetingRoom {
  readonly id: number
  readonly name: string
  readonly location: string | undefined
  readonly capacity: number
  readonly equipment: string | undefined
  readonly status: string
  readonly remark: string | undefined
}

/** 会议室新建与编辑草稿，与后台 RoomDraft 对应。 */
export interface RoomDraft {
  readonly name: string
  readonly location: string
  readonly capacity: string
  readonly equipment: string
  readonly remark: string
}

/** 预约记录单条，包含会议室名称与状态。 */
export interface RoomBooking {
  readonly id: number
  readonly roomId: number
  readonly roomName: string
  readonly title: string
  readonly meetingDate: string
  readonly startTime: string
  readonly endTime: string
  readonly organizerId: number
  readonly attendeeCount: number | undefined
  readonly status: string
  readonly cancelReason: string | undefined
}

/** 预约新建草稿，时间使用 HH:mm 文本。 */
export interface BookingDraft {
  readonly roomId: number | undefined
  readonly title: string
  readonly meetingDate: string
  readonly startTime: string
  readonly endTime: string
  readonly attendeeCount: string
}

/** 会议室列表筛选条件。 */
export interface RoomFilters {
  readonly keyword: string
  readonly status: '' | (typeof roomStatuses)[number]
}

/** 会议室列表结果，附当前用户的管理员身份。 */
export interface RoomPage {
  readonly items: readonly MeetingRoom[]
  readonly admin: boolean
}

/** 预约分页结果。 */
export interface BookingPage {
  readonly items: readonly RoomBooking[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
}

/** 主屏顶部页签。 */
export const meetingTabs = ['rooms', 'mine'] as const

/** 顶部页签类型。 */
export type MeetingTab = (typeof meetingTabs)[number]
