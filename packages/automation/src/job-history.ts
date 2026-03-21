import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

export interface JobRecord {
  id?: number
  jobName: string
  agentName: string
  status: 'success' | 'error'
  durationMs: number
  error?: string
  timestampMs: number
}

export class JobHistory {
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
      CREATE TABLE IF NOT EXISTS job_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_name TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        status TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        error TEXT,
        timestamp_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_job_name ON job_history(job_name);
      CREATE INDEX IF NOT EXISTS idx_job_ts ON job_history(timestamp_ms);
    `)
  }

  record(entry: JobRecord): void {
    this.db
      .prepare(
        `INSERT INTO job_history (job_name, agent_name, status, duration_ms, error, timestamp_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.jobName,
        entry.agentName,
        entry.status,
        entry.durationMs,
        entry.error ?? null,
        entry.timestampMs,
      )
  }

  list(opts?: {
    jobName?: string
    agentName?: string
    limit?: number
  }): JobRecord[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (opts?.jobName !== undefined) {
      conditions.push('job_name = ?')
      params.push(opts.jobName)
    }
    if (opts?.agentName !== undefined) {
      conditions.push('agent_name = ?')
      params.push(opts.agentName)
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = opts?.limit ?? 50

    const rows = this.db
      .prepare(
        `SELECT id, job_name, agent_name, status, duration_ms, error, timestamp_ms
         FROM job_history ${where}
         ORDER BY timestamp_ms DESC
         LIMIT ?`,
      )
      .all(...params, limit) as Array<{
      id: number
      job_name: string
      agent_name: string
      status: string
      duration_ms: number
      error: string | null
      timestamp_ms: number
    }>

    return rows.map((r) => ({
      id: r.id,
      jobName: r.job_name,
      agentName: r.agent_name,
      status: r.status as 'success' | 'error',
      durationMs: r.duration_ms,
      ...(r.error !== null && { error: r.error }),
      timestampMs: r.timestamp_ms,
    }))
  }

  prune(olderThanDays: number): number {
    const cutoffMs = Date.now() - olderThanDays * 86_400_000
    return this.db
      .prepare('DELETE FROM job_history WHERE timestamp_ms < ?')
      .run(cutoffMs).changes
  }

  close(): void {
    this.db.close()
  }
}
