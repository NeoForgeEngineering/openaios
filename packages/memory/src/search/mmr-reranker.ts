/**
 * Maximal Marginal Relevance reranking.
 * Balances relevance to query vs diversity among selected results.
 *
 * @param results - Array of { score, embedding } entries
 * @param queryEmbedding - Query vector
 * @param lambda - Balance factor (1.0 = pure relevance, 0.0 = pure diversity)
 * @param k - Number of results to select
 */
export function mmrRerank<T extends { score: number; embedding: Float32Array }>(
  results: T[],
  _queryEmbedding: Float32Array,
  lambda: number,
  k: number,
): T[] {
  if (results.length <= k) return results

  const selected: T[] = []
  const remaining = new Set(results.map((_, i) => i))

  for (let i = 0; i < k && remaining.size > 0; i++) {
    let bestIdx = -1
    let bestMmr = -Infinity

    for (const idx of remaining) {
      const item = results[idx]!
      const relevance = item.score

      let maxSim = 0
      for (const sel of selected) {
        const sim = cosineSimilarity(item.embedding, sel.embedding)
        if (sim > maxSim) maxSim = sim
      }

      const mmr = lambda * relevance - (1 - lambda) * maxSim
      if (mmr > bestMmr) {
        bestMmr = mmr
        bestIdx = idx
      }
    }

    if (bestIdx >= 0) {
      selected.push(results[bestIdx]!)
      remaining.delete(bestIdx)
    }
  }

  return selected
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
