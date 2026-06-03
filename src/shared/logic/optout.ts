// Opt-out keyword detection. When an incoming message is an opt-out request we must honour
// it immediately (stop further sends to that contact). Matching avoids raw substrings so
// "unstoppable", "bus stop", or "baja california" do not falsely trigger an unsubscribe.
//
// Two tiers:
//  - STRONG words/phrases are unambiguous opt-outs; they match as a standalone token or a
//    bounded phrase anywhere in the message (e.g. "please unsubscribe me").
//  - WEAK words are real opt-out words that also appear inside ordinary phrases ("stop",
//    Spanish "baja"); they only match when they are the entire message ("STOP").

const STRONG_WORDS = [
  'unsubscribe',
  'optout',
  'cancelar',
  'הסר', // Hebrew: remove
  'הסירו',
  'תפסיק',
  'תפסיקו',
  'הפסק'
]

const STRONG_PHRASES = ['no thanks', 'remove me', 'opt out']

const WEAK_WORDS = ['stop', 'baja']

/** Lowercase, collapse whitespace, and strip surrounding punctuation. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim()
}

export function isOptOutMessage(text: string): boolean {
  const normalized = normalize(text)
  if (!normalized) return false

  // Weak words: only when they are the whole message.
  if (WEAK_WORDS.includes(normalized)) return true

  const tokens = new Set(
    normalized.split(' ').map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean)
  )
  for (const word of STRONG_WORDS) {
    if (tokens.has(word)) return true
  }
  for (const phrase of STRONG_PHRASES) {
    if (
      normalized === phrase ||
      normalized.startsWith(phrase + ' ') ||
      normalized.endsWith(' ' + phrase) ||
      normalized.includes(' ' + phrase + ' ')
    ) {
      return true
    }
  }
  return false
}
