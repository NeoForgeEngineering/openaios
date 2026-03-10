import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentBudgetConfig } from '@openaios/core'
import Database from 'better-sqlite3'

export interface BudgetStatus {
  agentName: string
  period: string
  spentUsd: number
  limitUsd: number
  /** 0.0 – 1.0 */
  fraction: number
  isWarning: boolean
  isExceeded: boolean
  /** Model to use — may be downgraded */
  effectiveModel: string | null
}

export interface BudgetCheckResult {
  allowed: boolean
  reason?: string
  effectiveModel?: string
}

export class BudgetManager {
  private db: Database.Database
  private agentConfigs: Record<string, AgentBudgetConfig>
  private period: 'daily' | 'weekly' | 'monthly'

  constructor(options: {
    dataDir: string
    agentConfigs: Record<string, AgentBudgetConfig>
    period?: 'daily' | 'weekly' | 'monthly'
  }) {
    mkdirSync(options.dataDir, { recursive: true })
    this.db = new Database(join(options.dataDir, 'budget.db'))
    this.agentConfigs = options.agentConfigs
    this.period = options.period ?? 'monthly'
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_name  TEXT    NOT NULL,
        period      TEXT    NOT NULL,
        cost_usd    REAL    NOT NULL DEFAULT 0,
        input_tokens  INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        recorded_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_usage_agent_period
        ON usage (agent_name, period);
    `)
  }

  /**
   * Record a completed turn's cost.
   */
  record(
    agentName: string,
    costUsd: number,
    inputTokens = 0,
    outputTokens = 0,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO usage (agent_name, period, cost_usd, input_tokens, output_tokens, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      agentName,
      this.currentPeriod(),
      costUsd,
      inputTokens,
      outputTokens,
      Date.now(),
    )
  }

  /**
   * Check whether an agent is allowed to run, and which model to use.
   * Call this BEFORE starting a turn.
   */
  check(agentName: string, requestedModel: string): BudgetCheckResult {
    const cfg = this.agentConfigs[agentName]
    if (!cfg) {
      return { allowed: true, effectiveModel: requestedModel }
    }

    const spent = this.getSpent(agentName)
    const fraction = spent / cfg.limit

    if (fraction >= 1.0) {
      switch (cfg.on_exceeded) {
        case 'block':
          return {
            allowed: false,
            reason: `Budget exceeded for agent "${agentName}": $${spent.toFixed(4)} / $${cfg.limit} this ${this.period}`,
          }
        case 'downgrade':
          if (!cfg.downgrade_to) {
            return {
              allowed: false,
              reason: 'Budget exceeded and no downgrade_to model configured',
            }
          }
          return {
            allowed: true,
            effectiveModel: cfg.downgrade_to,
          }
        default:
          return { allowed: true, effectiveModel: requestedModel }
      }
    }

    return { allowed: true, effectiveModel: requestedModel }
  }

  /**
   * Get current period's spend for an agent.
   */
  getSpent(agentName: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) as total
         FROM usage
         WHERE agent_name = ? AND period = ?`,
      )
      .get(agentName, this.currentPeriod()) as { total: number }
    return row.total
  }

  /**
   * Full status summary for an agent.
   */
  status(agentName: string, requestedModel: string): BudgetStatus {
    const cfg = this.agentConfigs[agentName]
    const spent = this.getSpent(agentName)
    const limitUsd = cfg?.limit ?? Infinity
    const fraction = limitUsd === Infinity ? 0 : spent / limitUsd
    const check = this.check(agentName, requestedModel)

    return {
      agentName,
      period: this.currentPeriod(),
      spentUsd: spent,
      limitUsd,
      fraction,
      isWarning: cfg ? fraction >= cfg.warning_at : false,
      isExceeded: fraction >= 1.0,
      effectiveModel: check.effectiveModel ?? requestedModel,
    }
  }

  /**
   * Get status for all configured agents.
   */
  allStatuses(agentModels: Record<string, string>): BudgetStatus[] {
    return Object.keys(this.agentConfigs).map((name) =>
      this.status(name, agentModels[name] ?? 'unknown'),
    )
  }

  close(): void {
    this.db.close()
  }

  private currentPeriod(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')

    switch (this.period) {
      case 'daily':
        return `${y}-${m}-${d}`
      case 'weekly': {
        // ISO week
        const day = now.getDay() || 7
        const startOfWeek = new Date(now)
        startOfWeek.setDate(now.getDate() - day + 1)
        const wy = startOfWeek.getFullYear()
        const wm = String(startOfWeek.getMonth() + 1).padStart(2, '0')
        const wd = String(startOfWeek.getDate()).padStart(2, '0')
        return `${wy}-W${wm}-${wd}`
      }
      default:
        return `${y}-${m}`
    }
  }
}
