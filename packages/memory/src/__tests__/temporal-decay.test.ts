import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MemoryEntry } from '@openaios/core'
import { applyTemporalDecay } from '../search/temporal-decay.js'

describe('applyTemporalDecay', () => {
  const now = new Date('2026-03-16T00:00:00Z')

  function entry(key: string, daysAgo: number, score: number): MemoryEntry {
    const date = new Date(now.getTime() - daysAgo * 86_400_000)
    return {
      key,
      content: `content for ${key}`,
      score,
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
    }
  }

  it('recent memories score higher than old ones', () => {
    const results = applyTemporalDecay(
      [entry('recent', 1, 1.0), entry('old', 60, 1.0)],
      30,
      now,
    )

    assert.ok(results[0]!.score > results[1]!.score)
  })

  it('60-day-old memory is ~25% of 0-day memory with half_life=30', () => {
    const results = applyTemporalDecay(
      [entry('fresh', 0, 1.0), entry('old', 60, 1.0)],
      30,
      now,
    )

    const ratio = results[1]!.score / results[0]!.score
    // 2^(-60/30) = 0.25
    assert.ok(
      Math.abs(ratio - 0.25) < 0.01,
      `Ratio was ${ratio}, expected ~0.25`,
    )
  })

  it('half_life=30 means 30-day-old is ~50% of fresh', () => {
    const results = applyTemporalDecay(
      [entry('fresh', 0, 1.0), entry('half', 30, 1.0)],
      30,
      now,
    )

    const ratio = results[1]!.score / results[0]!.score
    assert.ok(Math.abs(ratio - 0.5) < 0.01, `Ratio was ${ratio}, expected ~0.5`)
  })

  it('preserves zero score', () => {
    const results = applyTemporalDecay([entry('zero', 10, 0)], 30, now)
    assert.equal(results[0]?.score, 0)
  })

  it('handles empty array', () => {
    const results = applyTemporalDecay([], 30, now)
    assert.deepEqual(results, [])
  })
})
