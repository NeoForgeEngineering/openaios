import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MemoryEntry } from '@openaios/core'
import { buildPromptContext } from '../prompt-injector.js'

function entry(key: string, content: string, score?: number): MemoryEntry {
  return {
    key,
    content,
    ...(score !== undefined && { score }),
    createdAt: '2026-03-16T00:00:00Z',
    updatedAt: '2026-03-16T00:00:00Z',
  }
}

describe('buildPromptContext', () => {
  it('returns empty string for no memories', () => {
    assert.equal(buildPromptContext([], 100), '')
  })

  it('returns empty string for zero maxTokens', () => {
    assert.equal(buildPromptContext([entry('k', 'v')], 0), '')
  })

  it('formats memories as markdown', () => {
    const result = buildPromptContext(
      [entry('greeting', 'Hello world', 0.95)],
      200,
    )
    assert.ok(result.includes('## Relevant Memories'))
    assert.ok(result.includes('**greeting**'))
    assert.ok(result.includes('0.95'))
    assert.ok(result.includes('Hello world'))
  })

  it('truncates to fit within token budget', () => {
    const longContent = 'x'.repeat(500)
    const result = buildPromptContext(
      [
        entry('a', longContent, 0.9),
        entry('b', longContent, 0.8),
        entry('c', longContent, 0.7),
      ],
      50, // ~200 chars
    )
    // Should not contain all 3 memories
    const maxChars = 50 * 4
    assert.ok(result.length <= maxChars + 10) // small tolerance for truncation marker
  })

  it('includes multiple memories when space allows', () => {
    const result = buildPromptContext(
      [entry('a', 'short a', 0.9), entry('b', 'short b', 0.8)],
      200,
    )
    assert.ok(result.includes('**a**'))
    assert.ok(result.includes('**b**'))
  })
})
