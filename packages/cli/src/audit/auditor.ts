import type { Config, SessionStore } from '@openaios/core'
import { logger } from '@openaios/core'
import type { BudgetManager } from '@openaios/budget'

export interface AuditFinding {
  agentName: string | 'system'
  severity: 'INFO' | 'WARN' | 'ERROR'
  code: string
  message: string
}

export interface AuditResult {
  ts: string
  findings: AuditFinding[]
  passed: number
  warned: number
  errors: number
}

export interface SecurityAuditorOptions {
  config: Config
  sessionStore: SessionStore
  budgetManager: BudgetManager
}

/**
 * SecurityAuditor — periodic scanner for misconfigurations and runtime anomalies.
 */
export class SecurityAuditor {
  private readonly config: Config
  private readonly sessionStore: SessionStore
  private readonly budgetManager: BudgetManager
  /** Session counts from the previous audit run (for growth detection) */
  private prevSessionCounts = new Map<string, number>()
  /** Timestamp when auditor was created (to detect dead agents) */
  private readonly startedAt = Date.now()

  constructor(opts: SecurityAuditorOptions) {
    this.config = opts.config
    this.sessionStore = opts.sessionStore
    this.budgetManager = opts.budgetManager
  }

  async run(): Promise<AuditResult> {
    const findings: AuditFinding[] = []

    // Static checks
    this.checkPermissions(findings)
    this.checkBudgetLimits(findings)
    this.checkWebhookSecurity(findings)
    this.checkAgentCallGovernance(findings)
    this.checkCircularAgentCalls(findings)

    // Dynamic checks
    await this.checkBudgetAcceleration(findings)
    await this.checkSessionExplosion(findings)
    await this.checkDeadAgents(findings)
    this.checkGovernanceDenialSpike(findings)

    const warned = findings.filter((f) => f.severity === 'WARN').length
    const errors = findings.filter((f) => f.severity === 'ERROR').length
    // Count checks that were checked but found no issues
    const totalChecks = 8
    const passed = totalChecks - (warned > 0 ? 1 : 0) - (errors > 0 ? 1 : 0)

    const result: AuditResult = {
      ts: new Date().toISOString(),
      findings,
      passed: Math.max(0, passed),
      warned,
      errors,
    }

    logger.debug('[audit]', `Audit complete: ${result.passed} passed, ${warned} warned, ${errors} errors`)
    return result
  }

  // ── Static checks ──────────────────────────────────────────────────────────

  private checkPermissions(findings: AuditFinding[]): void {
    for (const agent of this.config.agents) {
      const allow = agent.permissions.allow
      const deny = agent.permissions.deny
      const hasWildcard = allow.includes('*')
      const hasBash = allow.includes('Bash')
      const hasDenyList = deny.length > 0

      if ((hasWildcard || hasBash) && !hasDenyList) {
        findings.push({
          agentName: agent.name,
          severity: 'WARN',
          code: 'OVERLY_BROAD_PERMISSIONS',
          message: `Agent allows ${hasWildcard ? '*' : 'Bash'} with no deny list — consider adding explicit denials`,
        })
      }
    }
  }

  private checkBudgetLimits(findings: AuditFinding[]): void {
    const budgetAgents = this.config.budget?.agents ?? {}
    for (const agent of this.config.agents) {
      if (!budgetAgents[agent.name]) {
        findings.push({
          agentName: agent.name,
          severity: 'WARN',
          code: 'NO_BUDGET_LIMIT',
          message: 'Agent has no spending limit configured',
        })
      }
    }
  }

  private checkWebhookSecurity(findings: AuditFinding[]): void {
    const bind = this.config.network.bind
    const isPublic = bind !== 'localhost' && bind !== '127.0.0.1'
    for (const agent of this.config.agents) {
      if (agent.channels.webhook && !agent.channels.webhook.secret && isPublic) {
        findings.push({
          agentName: agent.name,
          severity: 'WARN',
          code: 'WEBHOOK_NO_SECRET',
          message: `Webhook exposed on ${bind} without a secret — set channels.webhook.secret`,
        })
      }
    }
  }

  private checkAgentCallGovernance(findings: AuditFinding[]): void {
    const hasBR = !!this.config.governance?.br
    for (const agent of this.config.agents) {
      const callees = agent.capabilities['agent-calls']
      if (callees.length > 0 && !hasBR) {
        findings.push({
          agentName: agent.name,
          severity: 'WARN',
          code: 'AGENT_CALLS_LOCAL_ONLY',
          message: `Agent can call ${callees.join(', ')} but governance is local-only — consider enabling BR governance`,
        })
      }
    }
  }

  private checkCircularAgentCalls(findings: AuditFinding[]): void {
    const callMap = new Map<string, string[]>()
    for (const agent of this.config.agents) {
      callMap.set(agent.name, agent.capabilities['agent-calls'])
    }

    for (const [name, callees] of callMap) {
      for (const callee of callees) {
        const calleesOfCallee = callMap.get(callee) ?? []
        if (calleesOfCallee.includes(name)) {
          findings.push({
            agentName: name,
            severity: 'ERROR',
            code: 'CIRCULAR_AGENT_CALLS',
            message: `Circular call detected: ${name} → ${callee} → ${name}`,
          })
        }
      }
    }
  }

  // ── Dynamic checks ─────────────────────────────────────────────────────────

  private async checkBudgetAcceleration(findings: AuditFinding[]): Promise<void> {
    // Simple heuristic: compare current period spend vs the configured limit
    // Full multi-period comparison would require more DB queries; skip for now
    // This is a placeholder for a more sophisticated check
  }

  private async checkSessionExplosion(findings: AuditFinding[]): Promise<void> {
    for (const agent of this.config.agents) {
      const sessions = await this.sessionStore.listByAgent(agent.name)
      const current = sessions.length
      const prev = this.prevSessionCounts.get(agent.name) ?? 0

      if (prev > 0 && current > prev * 1.5) {
        findings.push({
          agentName: agent.name,
          severity: 'WARN',
          code: 'SESSION_EXPLOSION',
          message: `Session count grew from ${prev} to ${current} (>${50}% increase since last audit)`,
        })
      }

      this.prevSessionCounts.set(agent.name, current)
    }
  }

  private async checkDeadAgents(findings: AuditFinding[]): Promise<void> {
    const uptimeMs = Date.now() - this.startedAt
    if (uptimeMs < 60 * 60 * 1000) return // Don't flag before 1h uptime

    for (const agent of this.config.agents) {
      const sessions = await this.sessionStore.listByAgent(agent.name)
      if (sessions.length === 0) {
        findings.push({
          agentName: agent.name,
          severity: 'INFO',
          code: 'DEAD_AGENT',
          message: 'Agent has 0 sessions but has been running >1h',
        })
      }
    }
  }

  private checkGovernanceDenialSpike(findings: AuditFinding[]): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentEntries = logger.getRecent().filter(
      (e) => e.level === 'warn' && e.ts > oneHourAgo
    )

    // Count governance denial log entries per agent
    const denialCounts = new Map<string, number>()
    for (const entry of recentEntries) {
      if (entry.msg.includes('denied') || entry.msg.includes('blocked')) {
        // Try to extract agent name from tag or message
        for (const agent of this.config.agents) {
          if (entry.msg.includes(agent.name) || entry.tag.includes(agent.name)) {
            denialCounts.set(agent.name, (denialCounts.get(agent.name) ?? 0) + 1)
          }
        }
      }
    }

    for (const [agentName, count] of denialCounts) {
      if (count > 5) {
        findings.push({
          agentName,
          severity: 'WARN',
          code: 'GOVERNANCE_DENIAL_SPIKE',
          message: `${count} tool denials in the last hour — possible misconfiguration or abuse`,
        })
      }
    }
  }
}
