import { describe, it, expect } from 'vitest'
import { renderTemplate, extractVars } from './template'

describe('renderTemplate', () => {
  it('replaces known placeholders', () => {
    expect(renderTemplate('Hi {{name}}!', { name: 'Dana' })).toBe('Hi Dana!')
  })

  it('handles surrounding whitespace inside braces', () => {
    expect(renderTemplate('Hi {{ name }}', { name: 'Dana' })).toBe('Hi Dana')
  })

  it('blanks unknown or null placeholders instead of leaking raw braces', () => {
    expect(renderTemplate('Hi {{name}}', {})).toBe('Hi ')
    expect(renderTemplate('Hi {{name}}', { name: null })).toBe('Hi ')
  })

  it('replaces repeated placeholders', () => {
    expect(renderTemplate('{{a}}-{{a}}', { a: 'x' })).toBe('x-x')
  })
})

describe('extractVars', () => {
  it('returns distinct variable names', () => {
    expect(extractVars('{{a}} {{b}} {{a}}').sort()).toEqual(['a', 'b'])
  })
})
