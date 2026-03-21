import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

export interface AuditEntry {
  id?: number
  agentName: string
  sessionKey: string
  eventType: 'tool_use' | 'turn_cost' | 'policy_deny' | 'rate_limit'
  tool?: string
  detail: string
  timestampMs: number
}

export class AuditLog {
  private db: Database.Database

  constructor(dbPath: string) {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.initSchema()
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_name TEXT NOT NULL,
        session_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        tool TEXT,
        detail TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_agent
        ON audit_log(agent_name);

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp
        ON audit_log(timestamp_ms);
    `)
  }

  log(entry: AuditEntry): void {
    this.db
      .prepare(
        `INSERT INTO audit_log (agent_name, session_key, event_type, tool, detail, timestamp_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.agentName,
        entry.sessionKey,
        entry.eventType,
        entry.tool ?? null,
        entry.detail,
        entry.timestampMs,
      )
  }

  query(opts: {
    agentName?: string
    eventType?: string
    limit?: number
  }): AuditEntry[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (opts.agentName !== undefined) {
      conditions.push('agent_name = ?')
      params.push(opts.agentName)
    }
    if (opts.eventType !== undefined) {
      conditions.push('event_type = ?')
      params.push(opts.eventType)
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = opts.limit ?? 100

    const rows = this.db
      .prepare(
        `SELECT id, agent_name, session_key, event_type, tool, detail, timestamp_ms
         FROM audit_log ${where}
         ORDER BY timestamp_ms DESC
         LIMIT ?`,
      )
      .all(...params, limit) as Array<{
      id: number
      agent_name: string
      session_key: string
      event_type: string
      tool: string | null
      detail: string
      timestamp_ms: number
    }>

    return rows.map((r) => ({
      id: r.id,
      agentName: r.agent_name,
      sessionKey: r.session_key,
      eventType: r.event_type as AuditEntry['eventType'],
      ...(r.tool !== null && { tool: r.tool }),
      detail: r.detail,
      timestampMs: r.timestamp_ms,
    }))
  }

  /** Remove entries older than the given number of days. */
  prune(olderThanDays: number): number {
    const cutoffMs = Date.now() - olderThanDays * 86_400_000
    const result = this.db
      .prepare('DELETE FROM audit_log WHERE timestamp_ms < ?')
      .run(cutoffMs)
    return result.changes
  }

  close(): void {
    this.db.close()
  }
}
