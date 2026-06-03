// Pure auto-reply rule matching. Rules are evaluated in priority order; the first
// match wins. A `fallback` rule matches anything (used as a catch-all).

import type { AutoReplyRule } from '../models'

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

/** Safely test a regex with a guard against catastrophic patterns (length cap). */
function safeRegexTest(pattern: string, text: string): boolean {
  if (pattern.length > 200) return false
  try {
    return new RegExp(pattern, 'i').test(text)
  } catch {
    return false
  }
}

export function ruleMatches(rule: AutoReplyRule, incoming: string): boolean {
  if (!rule.enabled) return false
  const text = normalize(incoming)
  switch (rule.matchType) {
    case 'exact':
      return rule.keyword != null && normalize(rule.keyword) === text
    case 'contains':
      return rule.keyword != null && text.includes(normalize(rule.keyword))
    case 'regex':
      return rule.keyword != null && safeRegexTest(rule.keyword, incoming)
    case 'fallback':
      return true
    default:
      return false
  }
}

/**
 * Returns the matching rule with the highest priority (lowest `priority` number wins),
 * or null when nothing matches. Fallback rules participate but rank by priority too.
 */
export function findMatchingRule(rules: AutoReplyRule[], incoming: string): AutoReplyRule | null {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority)
  for (const rule of ordered) {
    if (ruleMatches(rule, incoming)) return rule
  }
  return null
}
