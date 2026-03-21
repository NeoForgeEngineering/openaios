import type Database from 'better-sqlite3'

export interface RawSearchResult {
  id: number
  key: string
  content: string
  metadata_json: string | null
  embedding: Buffer
  created_at: string
  updated_at: string
  score: number
}

/**
 * Hybrid search: FTS5 BM25 + vector cosine similarity, merged with
 * Reciprocal Rank Fusion (RRF).
 */
export function hybridSearch(
  db: Database.Database,
  agentName: string,
  queryEmbedding: Float32Array,
  queryText: string,
  topK: number,
): RawSearchResult[] {
  const k = 60 // RRF constant

  // FTS5 BM25 search
  const ftsResults: Array<{ id: number; rank: number }> = db
    .prepare(
      `SELECT m.id, fts.rank
       FROM memories_fts fts
       JOIN memories m ON m.rowid = fts.rowid
       WHERE memories_fts MATCH ?
       AND m.agent_name = ?
       ORDER BY fts.rank
       LIMIT ?`,
    )
    .all(escapeFts(queryText), agentName, topK * 2) as Array<{
    id: number
    rank: number
  }>

  // Vector search using sqlite-vec
  const vecBlob = Buffer.from(queryEmbedding.buffer)
  const _vecResults: Array<{ id: number; distance: number }> = db
    .prepare(
      `SELECT m.id, v.distance
       FROM vec_memories v
       JOIN memories m ON m.id = v.rowid
       WHERE m.agent_name = ?
       ORDER BY v.distance
       LIMIT ?`,
    )
    .bind(agentName, topK * 2)
    .all() as Array<{ id: number; distance: number }>

  // Oops, vec_memories needs the query vector. We use a different approach:
  // Use the vec0 virtual table with a query
  const vecResults2: Array<{ rowid: number; distance: number }> = db
    .prepare(
      `SELECT rowid, distance
       FROM vec_memories
       WHERE embedding MATCH ?
       AND k = ?`,
    )
    .all(vecBlob, topK * 3) as Array<{ rowid: number; distance: number }>

  // Filter to agent's memories and build id->rank map
  const agentIds = new Set(
    (
      db
        .prepare('SELECT id FROM memories WHERE agent_name = ?')
        .all(agentName) as Array<{ id: number }>
    ).map((r) => r.id),
  )

  const vecFiltered = vecResults2.filter((r) => agentIds.has(r.rowid))

  // Build RRF scores
  const scores = new Map<number, number>()

  ftsResults.forEach((r, idx) => {
    const rrf = 1.0 / (k + idx + 1)
    scores.set(r.id, (scores.get(r.id) ?? 0) + rrf)
  })

  vecFiltered.forEach((r, idx) => {
    const rrf = 1.0 / (k + idx + 1)
    scores.set(r.rowid, (scores.get(r.rowid) ?? 0) + rrf)
  })

  // Sort by RRF score and fetch full rows
  const rankedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id]) => id)

  if (rankedIds.length === 0) return []

  const placeholders = rankedIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT id, key, content, metadata_json, embedding, created_at, updated_at
       FROM memories
       WHERE id IN (${placeholders})`,
    )
    .all(...rankedIds) as Array<{
    id: number
    key: string
    content: string
    metadata_json: string | null
    embedding: Buffer
    created_at: string
    updated_at: string
  }>

  // Reorder by RRF score
  const rowMap = new Map(rows.map((r) => [r.id, r]))
  return rankedIds
    .map((id) => {
      const row = rowMap.get(id)
      if (!row) return undefined
      return {
        ...row,
        score: scores.get(id) ?? 0,
      }
    })
    .filter((r): r is RawSearchResult => r !== undefined)
}

function escapeFts(query: string): string {
  // Simple FTS5 query: split on whitespace, wrap each term in quotes
  return query
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(' OR ')
}
