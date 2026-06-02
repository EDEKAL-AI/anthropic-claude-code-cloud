import { describe, it, expect } from 'vitest'
import { ruleMatches, findMatchingRule } from './autoreply'
import type { AutoReplyRule } from '../models'

function rule(partial: Partial<AutoReplyRule>): AutoReplyRule {
  return {
    id: 1,
    accountId: 'a',
    matchType: 'contains',
    keyword: null,
    templateId: 1,
    enabled: true,
    priority: 0,
    ...partial
  }
}

describe('ruleMatches', () => {
  it('exact matches ignore case and surrounding whitespace', () => {
    expect(ruleMatches(rule({ matchType: 'exact', keyword: 'Hi' }), '  hi ')).toBe(true)
    expect(ruleMatches(rule({ matchType: 'exact', keyword: 'Hi' }), 'hi there')).toBe(false)
  })

  it('contains matches substrings', () => {
    expect(ruleMatches(rule({ matchType: 'contains', keyword: 'price' }), 'what is the PRICE?')).toBe(true)
  })

  it('regex matches', () => {
    expect(ruleMatches(rule({ matchType: 'regex', keyword: '^order \\d+' }), 'order 123')).toBe(true)
  })

  it('rejects overly long regex patterns', () => {
    expect(ruleMatches(rule({ matchType: 'regex', keyword: 'a'.repeat(300) }), 'a')).toBe(false)
  })

  it('fallback always matches', () => {
    expect(ruleMatches(rule({ matchType: 'fallback' }), 'anything')).toBe(true)
  })

  it('disabled rules never match', () => {
    expect(ruleMatches(rule({ matchType: 'fallback', enabled: false }), 'x')).toBe(false)
  })
})

describe('findMatchingRule', () => {
  it('returns the highest-priority match (lowest number wins)', () => {
    const rules = [
      rule({ id: 1, matchType: 'fallback', priority: 10 }),
      rule({ id: 2, matchType: 'contains', keyword: 'price', priority: 1 })
    ]
    expect(findMatchingRule(rules, 'price?')?.id).toBe(2)
  })

  it('falls back when no specific rule matches', () => {
    const rules = [
      rule({ id: 1, matchType: 'fallback', priority: 10 }),
      rule({ id: 2, matchType: 'contains', keyword: 'price', priority: 1 })
    ]
    expect(findMatchingRule(rules, 'hello')?.id).toBe(1)
  })

  it('returns null when nothing matches', () => {
    const rules = [rule({ id: 2, matchType: 'exact', keyword: 'price', priority: 1 })]
    expect(findMatchingRule(rules, 'hello')).toBeNull()
  })
})
