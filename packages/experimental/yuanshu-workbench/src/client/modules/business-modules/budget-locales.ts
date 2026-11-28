/** 预算与成本统计面板的本地化文案，不包含业务计算。 */
export const budgetEn = {
  'budget.stats': 'Financial summary', 'budget.trend': 'Monthly cost trend', 'budget.amount': 'Budget',
  'budget.actual': 'Recorded cost', 'budget.balance': 'Budget remaining', 'budget.committed': 'Committed', 'budget.forecast': 'Forecast',
  'budget.undated': '{count} undated costs totalling {amount} included in recorded cost.',
  'budget.empty': 'No records', 'budget.noMonths': 'No dated cost records', 'budget.select': 'Select a project',
  'budget.budgetError': 'Budget data could not be loaded.', 'budget.costError': 'Cost data could not be loaded.',
}
/** 中文面板文案与英文键保持一致。 */
export const budgetZh: Record<keyof typeof budgetEn, string> = {
  'budget.stats': '统计面板', 'budget.trend': '月度成本趋势', 'budget.amount': '预算金额',
  'budget.actual': '实际成本', 'budget.balance': '预算余额', 'budget.committed': '已承诺金额', 'budget.forecast': '预测金额',
  'budget.undated': '有 {count} 笔成本缺少交易日期，合计 {amount}，已计入实际成本。',
  'budget.empty': '暂无记录', 'budget.noMonths': '暂无有交易日期的成本记录', 'budget.select': '请选择项目',
  'budget.budgetError': '预算数据加载失败。', 'budget.costError': '成本数据加载失败。',
}
