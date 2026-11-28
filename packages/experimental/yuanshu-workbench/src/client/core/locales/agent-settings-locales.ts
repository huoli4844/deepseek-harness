/** 智能体设置页的中英文文案，独立于工作台外壳文案。 */
export const agentSettingsEn = {
  'settings.tab.agents': 'Agents',
  'settings.agents': 'Installed agents',
  'settings.agentsHint': 'Agent presets registered on this device, including ones that failed to load.',
  'settings.agentsEmpty': 'No agent presets are registered on this device',
  'settings.agentsFailed': 'Unable to read installed agents',
  'settings.agentDefault': 'Default',
  'settings.agentReady': 'Available',
  'settings.agentUnavailable': 'Unavailable',
  'settings.agentId': 'ID',
  'settings.agentNoDescription': 'No description provided',
  'settings.agentUnavailableHint': 'This agent failed to load. Check its plugin dependencies.',
} as const

/** 与英文文案逐项对应的中文文案。 */
export const agentSettingsZh: Record<keyof typeof agentSettingsEn, string> = {
  'settings.tab.agents': '智能体',
  'settings.agents': '本机已注册智能体',
  'settings.agentsHint': '显示当前宿主注册的智能体，包含加载失败的项目。',
  'settings.agentsEmpty': '本机没有已注册的智能体',
  'settings.agentsFailed': '无法读取本机智能体',
  'settings.agentDefault': '默认',
  'settings.agentReady': '可用',
  'settings.agentUnavailable': '不可用',
  'settings.agentId': '标识',
  'settings.agentNoDescription': '暂无说明',
  'settings.agentUnavailableHint': '此智能体未能加载，请检查其插件依赖。',
}
