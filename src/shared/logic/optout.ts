// Opt-out keyword detection. When an incoming message is an opt-out request we must
// honour it immediately (stop further sends to that contact). Multilingual STOP words.

const STOP_WORDS = [
  'stop',
  'unsubscribe',
  'no thanks',
  'remove me',
  'opt out',
  'optout',
  'הסר', // Hebrew: remove
  'הסירו',
  'תפסיק',
  'תפסיקו',
  'הפסק',
  'baja', // Spanish
  'cancelar'
]

export function isOptOutMessage(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return false
  return STOP_WORDS.some((word) => normalized === word || normalized.includes(word))
}
