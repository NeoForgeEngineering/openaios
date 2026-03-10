import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Session, SessionKey, SessionStore } from '@openaios/core'
import Database from 'better-sqlite3'

/**
 * SQLiteSessionStore — stores sessions in a SQLite database.
 * More robust than file store for high-volume or concurrent deployments.
 */
export class SQLiteSessionStore implements SessionStore {
  private readonly db: Database.Database

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true })
    this.db = new Database(join(dataDir, 'sessions.db'))
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        agent_name     TEXT    NOT NULL,
        user_id        TEXT    NOT NULL,
        total_cost_usd REAL    NOT NULL DEFAULT 0,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        PRIMARY KEY (agent_name, user_id)
      );
    `)
  }

  async get(key: SessionKey): Promise<Session | undefined> {
    const row = this.db
      .prepare(`SELECT * FROM sessions WHERE agent_name = ? AND user_id = ?`)
      .get(key.agentName, key.userId) as DbRow | undefined

    return row ? rowToSession(row) : undefined
  }

  async set(session: Session): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions
           (agent_name, user_id, total_cost_usd, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (agent_name, user_id) DO UPDATE SET
           total_cost_usd = excluded.total_cost_usd,
           updated_at     = excluded.updated_at`,
      )
      .run(
        session.agentName,
        session.userId,
        session.totalCostUsd,
        session.createdAt,
        session.updatedAt,
      )
  }

  async delete(key: SessionKey): Promise<void> {
    this.db
      .prepare(`DELETE FROM sessions WHERE agent_name = ? AND user_id = ?`)
      .run(key.agentName, key.userId)
  }

  async listByAgent(agentName: string): Promise<Session[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions WHERE agent_name = ? ORDER BY updated_at DESC`,
      )
      .all(agentName) as DbRow[]
    return rows.map(rowToSession)
  }

  async listAll(): Promise<Session[]> {
    const rows = this.db
      .prepare(`SELECT * FROM sessions ORDER BY updated_at DESC`)
      .all() as DbRow[]
    return rows.map(rowToSession)
  }

  close(): void {
    this.db.close()
  }
}

interface DbRow {
  agent_name: string
  user_id: string
  total_cost_usd: number
  created_at: number
  updated_at: number
}

function rowToSession(row: DbRow): Session {
  return {
    agentName: row.agent_name,
    userId: row.user_id,
    totalCostUsd: row.total_cost_usd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
