// UI-editable global settings. Only these keys are exposed to the renderer — secrets such
// as the master key and license token live in the same table but are never returned by the
// settings:get channel.

export const SETTING_KEYS = [
  'quietStartHour',
  'quietEndHour',
  'defaultRateMinMs',
  'defaultRateMaxMs',
  'defaultDailyCap',
  'simulateTyping',
  'complianceAcceptedAt'
] as const

export type SettingKey = (typeof SETTING_KEYS)[number]

export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  quietStartHour: '2',
  quietEndHour: '6',
  defaultRateMinMs: '8000',
  defaultRateMaxMs: '25000',
  defaultDailyCap: '200',
  simulateTyping: 'true',
  complianceAcceptedAt: ''
}

export function isPublicSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(key)
}
