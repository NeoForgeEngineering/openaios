import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Session, SessionKey, SessionStore } from '@openaios/core'

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
        agent_name        TEXT    NOT NULL,
        user_id           TEXT    NOT NULL,
        claude_session_id TEXT    NOT NULL,
        current_model     TEXT    NOT NULL,
        total_cost_usd    REAL    NOT NULL DEFAULT 0,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL,
        PRIMARY KEY (agent_name, user_id)
      );
    `)
  }

  async get(key: SessionKey): Promise<Session | undefined> {
    const row = this.db
      .prepare(
        `SELECT * FROM sessions WHERE agent_name = ? AND user_id = ?`
      )
      .get(key.agentName, key.userId) as DbRow | undefined

    return row ? rowToSession(row) : undefined
  }

  async set(session: Session): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions
           (agent_name, user_id, claude_session_id, current_model, total_cost_usd, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (agent_name, user_id) DO UPDATE SET
           claude_session_id = excluded.claude_session_id,
           current_model     = excluded.current_model,
           total_cost_usd    = excluded.total_cost_usd,
           updated_at        = excluded.updated_at`
      )
      .run(
        session.agentName,
        session.userId,
        session.claudeSessionId,
        session.currentModel,
        session.totalCostUsd,
        session.createdAt,
        session.updatedAt
      )
  }

  async delete(key: SessionKey): Promise<void> {
    this.db
      .prepare(`DELETE FROM sessions WHERE agent_name = ? AND user_id = ?`)
      .run(key.agentName, key.userId)
  }

  async listByAgent(agentName: string): Promise<Session[]> {
    const rows = this.db
      .prepare(`SELECT * FROM sessions WHERE agent_name = ? ORDER BY updated_at DESC`)
      .all(agentName) as DbRow[]
    return rows.map(rowToSession)
  }

  close(): void {
    this.db.close()
  }
}

interface DbRow {
  agent_name: string
  user_id: string
  claude_session_id: string
  current_model: string
  total_cost_usd: number
  created_at: number
  updated_at: number
}

function rowToSession(row: DbRow): Session {
  return {
    agentName: row.agent_name,
    userId: row.user_id,
    claudeSessionId: row.claude_session_id,
    currentModel: row.current_model,
    totalCostUsd: row.total_cost_usd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
