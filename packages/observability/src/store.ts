import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import type { ChatMessage, MetricsSummary, TurnRecord } from './types.js'

/**
 * ObservabilityStore — SQLite-backed persistent store for all agent activity.
 *
 * Tables:
 * - turns: every agent turn with tokens, cost, duration
 * - tool_calls: individual tool executions within a turn
 * - chat_messages: conversation history scoped by agent + session
 */
export class ObservabilityStore {
  private db: Database.Database

  constructor(dbPath: string) {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.initSchema()
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_name TEXT NOT NULL,
        session_key TEXT NOT NULL,
        channel TEXT NOT NULL,
        model TEXT NOT NULL,
        user_message TEXT NOT NULL,
        agent_message TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        timestamp_ms INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_turns_agent ON turns(agent_name);
      CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(agent_name, session_key);
      CREATE INDEX IF NOT EXISTS idx_turns_ts ON turns(timestamp_ms);

      CREATE TABLE IF NOT EXISTS tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turn_id INTEGER NOT NULL,
        tool TEXT NOT NULL,
        input TEXT,
        output TEXT,
        allowed INTEGER NOT NULL DEFAULT 1,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (turn_id) REFERENCES turns(id)
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_name TEXT NOT NULL,
        session_key TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model TEXT,
        tokens INTEGER,
        cost_usd REAL,
        timestamp_ms INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(agent_name, session_key);
      CREATE INDEX IF NOT EXISTS idx_chat_ts ON chat_messages(timestamp_ms);
    `)
  }

  // ── Turn recording ──────────────────────────────────────────

  recordTurn(turn: TurnRecord): number {
    const result = this.db
      .prepare(
        `INSERT INTO turns (agent_name, session_key, channel, model, user_message, agent_message,
         input_tokens, output_tokens, cost_usd, duration_ms, timestamp_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        turn.agentName,
        turn.sessionKey,
        turn.channel,
        turn.model,
        turn.userMessage,
        turn.agentMessage,
        turn.inputTokens,
        turn.outputTokens,
        turn.costUsd,
        turn.durationMs,
        turn.timestampMs,
      )

    const turnId = Number(result.lastInsertRowid)

    if (turn.toolCalls) {
      const stmt = this.db.prepare(
        `INSERT INTO tool_calls (turn_id, tool, input, output, allowed, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      for (const tc of turn.toolCalls) {
        stmt.run(
          turnId,
          tc.tool,
          tc.input,
          tc.output,
          tc.allowed ? 1 : 0,
          tc.durationMs,
        )
      }
    }

    return turnId
  }

  // ── Chat history ────────────────────────────────────────────

  recordMessage(msg: ChatMessage): void {
    this.db
      .prepare(
        `INSERT INTO chat_messages (agent_name, session_key, role, content, model, tokens, cost_usd, timestamp_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        msg.agentName,
        msg.sessionKey,
        msg.role,
        msg.content,
        msg.model ?? null,
        msg.tokens ?? null,
        msg.costUsd ?? null,
        msg.timestampMs,
      )
  }

  getChatHistory(
    agentName: string,
    sessionKey: string,
    opts?: { limit?: number; before?: number },
  ): ChatMessage[] {
    const limit = opts?.limit ?? 50
    const before = opts?.before ?? Date.now() + 1

    return (
      this.db
        .prepare(
          `SELECT id, agent_name, session_key, role, content, model, tokens, cost_usd, timestamp_ms
         FROM chat_messages
         WHERE agent_name = ? AND session_key = ? AND timestamp_ms < ?
         ORDER BY timestamp_ms DESC
         LIMIT ?`,
        )
        .all(agentName, sessionKey, before, limit) as Array<{
        id: number
        agent_name: string
        session_key: string
        role: string
        content: string
        model: string | null
        tokens: number | null
        cost_usd: number | null
        timestamp_ms: number
      }>
    )
      .reverse()
      .map((r) => ({
        id: r.id,
        agentName: r.agent_name,
        sessionKey: r.session_key,
        role: r.role as 'user' | 'assistant',
        content: r.content,
        ...(r.model !== null && { model: r.model }),
        ...(r.tokens !== null && { tokens: r.tokens }),
        ...(r.cost_usd !== null && { costUsd: r.cost_usd }),
        timestampMs: r.timestamp_ms,
      }))
  }

  // ── Metrics queries ─────────────────────────────────────────

  getAgentMetrics(
    agentName: string,
    opts?: { fromMs?: number; toMs?: number },
  ): MetricsSummary {
    const from = opts?.fromMs ?? 0
    const to = opts?.toMs ?? Date.now() + 1

    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) as turns,
           COALESCE(SUM(input_tokens), 0) as total_input,
           COALESCE(SUM(output_tokens), 0) as total_output,
           COALESCE(SUM(cost_usd), 0) as total_cost,
           COALESCE(AVG(duration_ms), 0) as avg_duration,
           (SELECT COUNT(*) FROM tool_calls tc JOIN turns t ON tc.turn_id = t.id
            WHERE t.agent_name = ? AND t.timestamp_ms BETWEEN ? AND ?) as tool_calls,
           (SELECT COUNT(*) FROM turns WHERE agent_name = ? AND error IS NOT NULL
            AND timestamp_ms BETWEEN ? AND ?) as errors
         FROM turns
         WHERE agent_name = ? AND timestamp_ms BETWEEN ? AND ?`,
      )
      .get(agentName, from, to, agentName, from, to, agentName, from, to) as {
      turns: number
      total_input: number
      total_output: number
      total_cost: number
      avg_duration: number
      tool_calls: number
      errors: number
    }

    return {
      agentName,
      period: `${new Date(from).toISOString()} - ${new Date(to).toISOString()}`,
      turns: row.turns,
      totalInputTokens: row.total_input,
      totalOutputTokens: row.total_output,
      totalCostUsd: row.total_cost,
      avgDurationMs: Math.round(row.avg_duration),
      toolCalls: row.tool_calls,
      errors: row.errors,
    }
  }

  getAllMetrics(opts?: { fromMs?: number; toMs?: number }): MetricsSummary[] {
    const from = opts?.fromMs ?? 0
    const to = opts?.toMs ?? Date.now() + 1

    const agents = this.db
      .prepare(
        'SELECT DISTINCT agent_name FROM turns WHERE timestamp_ms BETWEEN ? AND ?',
      )
      .all(from, to) as Array<{ agent_name: string }>

    return agents.map((a) => this.getAgentMetrics(a.agent_name, opts))
  }

  getRecentTurns(opts?: { agentName?: string; limit?: number }): TurnRecord[] {
    const limit = opts?.limit ?? 20
    const condition = opts?.agentName ? 'WHERE agent_name = ?' : ''
    const params = opts?.agentName ? [opts.agentName, limit] : [limit]

    return (
      this.db
        .prepare(
          `SELECT id, agent_name, session_key, channel, model, user_message, agent_message,
         input_tokens, output_tokens, cost_usd, duration_ms, timestamp_ms
         FROM turns ${condition}
         ORDER BY timestamp_ms DESC
         LIMIT ?`,
        )
        .all(...params) as Array<{
        id: number
        agent_name: string
        session_key: string
        channel: string
        model: string
        user_message: string
        agent_message: string
        input_tokens: number
        output_tokens: number
        cost_usd: number
        duration_ms: number
        timestamp_ms: number
      }>
    ).map((r) => ({
      id: r.id,
      agentName: r.agent_name,
      sessionKey: r.session_key,
      channel: r.channel,
      model: r.model,
      userMessage: r.user_message,
      agentMessage: r.agent_message,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costUsd: r.cost_usd,
      durationMs: r.duration_ms,
      timestampMs: r.timestamp_ms,
    }))
  }

  // ── Maintenance ─────────────────────────────────────────────

  prune(olderThanDays: number): { turns: number; messages: number } {
    const cutoff = Date.now() - olderThanDays * 86_400_000

    // Delete tool_calls for old turns
    this.db
      .prepare(
        'DELETE FROM tool_calls WHERE turn_id IN (SELECT id FROM turns WHERE timestamp_ms < ?)',
      )
      .run(cutoff)

    const turns = this.db
      .prepare('DELETE FROM turns WHERE timestamp_ms < ?')
      .run(cutoff).changes

    const messages = this.db
      .prepare('DELETE FROM chat_messages WHERE timestamp_ms < ?')
      .run(cutoff).changes

    return { turns, messages }
  }

  close(): void {
    this.db.close()
  }
}
