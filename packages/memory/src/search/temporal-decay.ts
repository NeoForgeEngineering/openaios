import type { MemoryEntry } from '@openaios/core'

/**
 * Apply exponential temporal decay to scored memory entries.
 * score *= 2^(-age_days / halfLifeDays)
 */
export function applyTemporalDecay(
  results: MemoryEntry[],
  halfLifeDays: number,
  now?: Date,
): MemoryEntry[] {
  const nowMs = (now ?? new Date()).getTime()
  const msPerDay = 86_400_000

  return results.map((entry) => {
    const ageDays = (nowMs - new Date(entry.updatedAt).getTime()) / msPerDay
    const decayFactor = 2 ** (-ageDays / halfLifeDays)
    return {
      ...entry,
      score: (entry.score ?? 0) * decayFactor,
    }
  })
}
