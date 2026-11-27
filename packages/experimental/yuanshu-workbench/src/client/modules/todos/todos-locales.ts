/** 「我的待办」文案；中文为键源，英文逐键对齐。 */

/** 英文文案。 */
export const todosEn = {
  'todos.title': 'My to-dos',
  'todos.count': '{count} open',
  'todos.empty': 'No to-dos yet. Say “organize my to-dos” in a conversation and confirm the result.',
  'todos.loading': 'Loading to-dos…',
  'todos.loadFailed': 'Could not load to-dos. Please try again later.',
  'todos.noDue': 'No due time',
  'todos.overdue': 'Overdue',
  'todos.dueToday': 'Today',
  'todos.markDone': 'Mark as done',
  'todos.reopen': 'Reopen',
  'todos.remove': 'Delete',
  'todos.refresh': 'Refresh',
  'todos.enableNotify': 'Enable desktop reminders',
  'todos.notifyOn': 'Desktop reminders are on',
  'todos.notifyDenied': 'Notifications are blocked. Allow them in system settings to get reminders.',
  'todos.reminderTitle': 'To-do reminder',
  'todos.reminderDue': 'Due: {time}',
  'todos.reminderNoDue': 'No due time set',
}

/** 中文文案。 */
export const todosZh: Record<keyof typeof todosEn, string> = {
  'todos.title': '我的待办',
  'todos.count': '{count} 条未完成',
  'todos.empty': '暂无待办。在对话里说「帮我整理一下待办」，确认后会出现在这里。',
  'todos.loading': '正在读取待办…',
  'todos.loadFailed': '待办读取失败，请稍后重试。',
  'todos.noDue': '未设时间',
  'todos.overdue': '已逾期',
  'todos.dueToday': '今天',
  'todos.markDone': '标记完成',
  'todos.reopen': '恢复未完成',
  'todos.remove': '删除',
  'todos.refresh': '刷新',
  'todos.enableNotify': '开启桌面提醒',
  'todos.notifyOn': '已开启桌面提醒',
  'todos.notifyDenied': '系统通知被拒绝，请在系统设置中允许本应用发送通知。',
  'todos.reminderTitle': '待办提醒',
  'todos.reminderDue': '时间节点：{time}',
  'todos.reminderNoDue': '未设时间节点',
}
