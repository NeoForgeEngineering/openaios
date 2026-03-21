import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { MemoryAdapter, MemoryEntry } from '@openaios/core'
import { logger } from '@openaios/core'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import type { EmbeddingProvider } from './embedding-provider.js'
import { buildPromptContext } from './prompt-injector.js'
import { hybridSearch } from './search/hybrid-search.js'
import { mmrRerank } from './search/mmr-reranker.js'
import { applyTemporalDecay } from './search/temporal-decay.js'

export interface MemoryStoreOptions {
  dir: string
  embeddingProvider: EmbeddingProvider
  topK?: number
  decayHalfLifeDays?: number
  mmrLambda?: number
}

export class MemoryStore implements MemoryAdapter {
  private db: Database.Database
  private embedding: EmbeddingProvider
  private topK: number
  private decayHalfLifeDays: number
  private mmrLambda: number

  constructor(opts: MemoryStoreOptions) {
    this.embedding = opts.embeddingProvider
    this.topK = opts.topK ?? 5
    this.decayHalfLifeDays = opts.decayHalfLifeDays ?? 30
    this.mmrLambda = opts.mmrLambda ?? 0.7

    // Ensure directory exists
    if (!existsSync(opts.dir)) {
      mkdirSync(opts.dir, { recursive: true })
    }

    const dbPath = join(opts.dir, 'memory.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')

    // Load sqlite-vec extension
    sqliteVec.load(this.db)

    this.initSchema()
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_name TEXT NOT NULL,
        key TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata_json TEXT,
        embedding BLOB,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(agent_name, key)
      );

      CREATE INDEX IF NOT EXISTS idx_memories_agent
        ON memories(agent_name);

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        key, content, content=memories, content_rowid=id
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, key, content)
        VALUES (new.id, new.key, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, key, content)
        VALUES ('delete', old.id, old.key, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, key, content)
        VALUES ('delete', old.id, old.key, old.content);
        INSERT INTO memories_fts(rowid, key, content)
        VALUES (new.id, new.key, new.content);
      END;
    `)

    // Create vec0 virtual table for vector search
    const dims = this.embedding.dimensions
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
        embedding float[${dims}]
      );
    `)
  }

  async store(
    agentName: string,
    key: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const embedding = await this.embedding.embed(content)
    const embeddingBlob = Buffer.from(embedding.buffer)
    const metadataJson =
      metadata !== undefined ? JSON.stringify(metadata) : null
    const now = new Date().toISOString()

    const existing = this.db
      .prepare('SELECT id FROM memories WHERE agent_name = ? AND key = ?')
      .get(agentName, key) as { id: number } | undefined

    // Use a transaction for atomicity
    const upsert = this.db.transaction(() => {
      if (existing) {
        const id = existing.id
        this.db
          .prepare(
            `UPDATE memories
             SET content = ?, metadata_json = ?, embedding = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(content, metadataJson, embeddingBlob, now, id)

        this.db.prepare('DELETE FROM vec_memories WHERE rowid = ?').run(id)
        this.db
          .prepare(
            'INSERT INTO vec_memories(rowid, embedding) VALUES (CAST(? AS INTEGER), ?)',
          )
          .run(id, embeddingBlob)
      } else {
        const result = this.db
          .prepare(
            `INSERT INTO memories (agent_name, key, content, metadata_json, embedding, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(agentName, key, content, metadataJson, embeddingBlob, now, now)

        this.db
          .prepare(
            'INSERT INTO vec_memories(rowid, embedding) VALUES (CAST(? AS INTEGER), ?)',
          )
          .run(Number(result.lastInsertRowid), embeddingBlob)
      }
    })
    upsert()
  }

  async search(
    agentName: string,
    query: string,
    opts?: { topK?: number; minScore?: number },
  ): Promise<MemoryEntry[]> {
    const topK = opts?.topK ?? this.topK

    let queryEmbedding: Float32Array
    try {
      queryEmbedding = await this.embedding.embed(query)
    } catch (err) {
      logger.error(
        '[memory]',
        `Embedding failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      return []
    }

    const raw = hybridSearch(
      this.db,
      agentName,
      queryEmbedding,
      query,
      topK * 2,
    )

    if (raw.length === 0) return []

    // Enrich with embeddings for MMR
    const withEmbeddings = raw.map((r) => ({
      ...r,
      embedding: new Float32Array(
        r.embedding.buffer,
        r.embedding.byteOffset,
        r.embedding.byteLength / 4,
      ),
    }))

    // MMR rerank for diversity
    const mmrResults = mmrRerank(
      withEmbeddings,
      queryEmbedding,
      this.mmrLambda,
      topK,
    )

    // Convert to MemoryEntry
    let entries: MemoryEntry[] = mmrResults.map((r) => ({
      key: r.key,
      content: r.content,
      ...(r.metadata_json !== null && {
        metadata: JSON.parse(r.metadata_json) as Record<string, unknown>,
      }),
      score: r.score,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))

    // Apply temporal decay
    entries = applyTemporalDecay(entries, this.decayHalfLifeDays)

    // Re-sort by decayed score
    entries.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

    // Apply minScore filter
    if (opts?.minScore !== undefined) {
      entries = entries.filter((e) => (e.score ?? 0) >= opts.minScore!)
    }

    return entries.slice(0, topK)
  }

  async get(agentName: string, key: string): Promise<MemoryEntry | undefined> {
    const row = this.db
      .prepare(
        'SELECT key, content, metadata_json, created_at, updated_at FROM memories WHERE agent_name = ? AND key = ?',
      )
      .get(agentName, key) as
      | {
          key: string
          content: string
          metadata_json: string | null
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) return undefined

    return {
      key: row.key,
      content: row.content,
      ...(row.metadata_json !== null && {
        metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
      }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async delete(agentName: string, key: string): Promise<void> {
    const existing = this.db
      .prepare('SELECT id FROM memories WHERE agent_name = ? AND key = ?')
      .get(agentName, key) as { id: number } | undefined

    if (existing) {
      this.db
        .prepare('DELETE FROM vec_memories WHERE rowid = ?')
        .run(existing.id)
      this.db.prepare('DELETE FROM memories WHERE id = ?').run(existing.id)
    }
  }

  async buildPromptContext(
    agentName: string,
    query: string,
    maxTokens: number,
  ): Promise<string> {
    const memories = await this.search(agentName, query)
    return buildPromptContext(memories, maxTokens)
  }

  close(): void {
    this.db.close()
  }
}
