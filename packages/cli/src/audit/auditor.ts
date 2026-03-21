import { readFileSync } from 'node:fs'
import type { BudgetManager } from '@openaios/budget'
import type { Config, SessionStore } from '@openaios/core'
import { logger } from '@openaios/core'

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
  configPath?: string
  sessionStore: SessionStore
  budgetManager: BudgetManager
}

/**
 * SecurityAuditor — periodic scanner for misconfigurations and runtime anomalies.
 */
export class SecurityAuditor {
  private readonly config: Config
  private readonly rawConfigYaml: string
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
    // Read raw YAML to check for hardcoded secrets (before env var resolution)
    try {
      this.rawConfigYaml = opts.configPath
        ? readFileSync(opts.configPath, 'utf-8')
        : ''
    } catch {
      this.rawConfigYaml = ''
    }
  }

  async run(): Promise<AuditResult> {
    const findings: AuditFinding[] = []

    // Static checks — config validation
    this.checkPermissions(findings)
    this.checkBudgetLimits(findings)
    this.checkWebhookSecurity(findings)
    this.checkAgentCallGovernance(findings)
    this.checkCircularAgentCalls(findings)
    this.checkNativeSafeguard(findings)
    this.checkChannelSecurity(findings)
    this.checkMemoryConfig(findings)
    this.checkAutomationSecurity(findings)
    this.checkGatewaySecurity(findings)
    this.checkGovernanceExtensions(findings)
    this.checkBrowserSecurity(findings)

    // Dynamic checks — runtime anomalies
    await this.checkBudgetAcceleration(findings)
    await this.checkSessionExplosion(findings)
    await this.checkDeadAgents(findings)
    this.checkGovernanceDenialSpike(findings)

    const warned = findings.filter((f) => f.severity === 'WARN').length
    const errors = findings.filter((f) => f.severity === 'ERROR').length
    const totalChecks = 15
    const passed = totalChecks - (warned > 0 ? 1 : 0) - (errors > 0 ? 1 : 0)

    const result: AuditResult = {
      ts: new Date().toISOString(),
      findings,
      passed: Math.max(0, passed),
      warned,
      errors,
    }

    logger.debug(
      '[audit]',
      `Audit complete: ${result.passed} passed, ${warned} warned, ${errors} errors`,
    )
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
    const hasAdminToken = !!this.config.network.admin_token

    for (const agent of this.config.agents) {
      if (agent.channels.webhook && !agent.channels.webhook.secret) {
        findings.push({
          agentName: agent.name,
          severity: isPublic ? 'ERROR' : 'WARN',
          code: 'WEBHOOK_NO_SECRET',
          message: isPublic
            ? `Webhook exposed on ${bind} without a secret — CRITICAL: anyone can send messages to this agent`
            : `Webhook has no secret — set channels.webhook.secret for authentication`,
        })
      }
    }

    // Dashboard auth check
    if (isPublic && !hasAdminToken) {
      findings.push({
        agentName: 'system',
        severity: 'ERROR',
        code: 'DASHBOARD_NO_AUTH',
        message: `Dashboard exposed on ${bind} without admin_token — anyone can read config, modify agents, and view all data. Set network.admin_token.`,
      })
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

  private checkNativeSafeguard(findings: AuditFinding[]): void {
    for (const agent of this.config.agents) {
      if (
        agent.runner.env === 'native' &&
        agent.runner.native?.allow_host_access
      ) {
        findings.push({
          agentName: agent.name,
          severity: 'WARN',
          code: 'NATIVE_MODE_ENABLED',
          message:
            `Agent is UNSANDBOXED — running in native mode with full host access. ` +
            `It can read/write the filesystem, see processes, and access the network. ` +
            `Use runner.env: docker for production deployments.`,
        })
      } else if (
        agent.runner.env === 'native' &&
        !agent.runner.native?.allow_host_access
      ) {
        findings.push({
          agentName: agent.name,
          severity: 'ERROR',
          code: 'NATIVE_NOT_EXPLICIT',
          message:
            `Agent runs in native mode but runner.native.allow_host_access is not set. ` +
            `Native agents have direct access to the host filesystem and processes. ` +
            `Add runner.native: { allow_host_access: true } to acknowledge this, ` +
            `or switch to runner.env: docker.`,
        })
      }
      if (
        agent.runner.llm !== 'claude-code' &&
        !agent.runner.llm_config?.base_url
      ) {
        findings.push({
          agentName: agent.name,
          severity: 'ERROR',
          code: 'LLM_GATEWAY_MISSING',
          message:
            `runner.llm is "${agent.runner.llm}" but runner.llm_config.base_url is not set. ` +
            `Non-claude-code LLMs require a gateway (e.g. LiteLLM) that translates to ` +
            `Anthropic API format.`,
        })
      }
    }
  }

  // ── Channel security ───────────────────────────────────────────────────────

  private checkChannelSecurity(findings: AuditFinding[]): void {
    const bind = this.config.network.bind
    const isPublic = bind !== 'localhost' && bind !== '127.0.0.1'

    for (const agent of this.config.agents) {
      const ch = agent.channels

      // Telegram token exposed in config (should use env var)
      // Check the raw YAML — the resolved config will always have the actual token
      if (ch.telegram && this.rawConfigYaml) {
        const hasEnvRef = /telegram[\s\S]*?token:\s*\$\{/.test(
          this.rawConfigYaml,
        )
        if (!hasEnvRef) {
          findings.push({
            agentName: agent.name,
            severity: 'WARN',
            code: 'TELEGRAM_TOKEN_HARDCODED',
            message:
              'Telegram token appears hardcoded — use ${ENV_VAR} reference',
          })
        }
      }

      // Slack without signing secret on public network
      if (ch.slack && !ch.slack.signing_secret && isPublic) {
        findings.push({
          agentName: agent.name,
          severity: 'WARN',
          code: 'SLACK_NO_SIGNING_SECRET',
          message: 'Slack exposed publicly without signing_secret',
        })
      }

      // Google Chat webhook without auth on public network
      if (ch.google_chat && isPublic) {
        findings.push({
          agentName: agent.name,
          severity: 'INFO',
          code: 'GOOGLE_CHAT_PUBLIC',
          message:
            'Google Chat webhook is public — ensure Google verifies the sender',
        })
      }

      // No DM allowlist on public-facing agent with multiple channels
      const channelCount = [
        ch.telegram,
        ch.slack,
        ch.whatsapp,
        ch.signal,
        ch.discord,
      ].filter(Boolean).length
      if (channelCount > 1 && !ch.dm_allowlist?.user_ids?.length) {
        findings.push({
          agentName: agent.name,
          severity: 'INFO',
          code: 'NO_DM_ALLOWLIST',
          message: `Agent has ${channelCount} channels but no DM allowlist — anyone can message`,
        })
      }

      // Group routing not configured for multi-channel agents
      if (channelCount > 0 && !ch.group_routing) {
        findings.push({
          agentName: agent.name,
          severity: 'INFO',
          code: 'NO_GROUP_ROUTING',
          message:
            'No group_routing configured — agent responds to all group messages by default',
        })
      }
    }
  }

  // ── Memory config ─────────────────────────────────────────────────────────

  private checkMemoryConfig(findings: AuditFinding[]): void {
    const mem = this.config.memory
    if (mem.provider && !mem.api_key && mem.provider !== 'ollama') {
      findings.push({
        agentName: 'system',
        severity: 'ERROR',
        code: 'MEMORY_API_KEY_MISSING',
        message: `Memory provider "${mem.provider}" requires an API key but none configured`,
      })
    }
  }

  // ── Automation security ───────────────────────────────────────────────────

  private checkAutomationSecurity(findings: AuditFinding[]): void {
    const auto = this.config.automation
    if (!auto) return

    const bind = this.config.network.bind
    const isPublic = bind !== 'localhost' && bind !== '127.0.0.1'

    // Webhook endpoints without tokens on public network
    if (auto.webhooks?.paths) {
      for (const wh of auto.webhooks.paths) {
        if (!wh.token && isPublic) {
          findings.push({
            agentName: wh.agent,
            severity: 'WARN',
            code: 'AUTOMATION_WEBHOOK_NO_TOKEN',
            message: `Automation webhook ${wh.path} exposed publicly without token auth`,
          })
        }
      }
    }

    // Cron jobs that run too frequently
    if (auto.cron?.jobs) {
      for (const job of auto.cron.jobs) {
        if (job.schedule.startsWith('* ') || job.schedule === '* * * * *') {
          findings.push({
            agentName: job.agent,
            severity: 'WARN',
            code: 'CRON_TOO_FREQUENT',
            message: `Cron job "${job.name}" runs every minute — may cause excessive API usage`,
          })
        }
      }
    }
  }

  // ── Gateway security ──────────────────────────────────────────────────────

  private checkGatewaySecurity(findings: AuditFinding[]): void {
    const gw = this.config.gateway
    if (!gw) return

    if (gw.enabled && !gw.auth_token) {
      findings.push({
        agentName: 'system',
        severity: 'WARN',
        code: 'GATEWAY_NO_AUTH',
        message:
          'WebSocket gateway enabled without auth_token — anyone can connect and subscribe to events',
      })
    }
  }

  // ── Governance extensions ─────────────────────────────────────────────────

  private checkGovernanceExtensions(findings: AuditFinding[]): void {
    const gov = this.config.governance
    if (!gov) return

    // Rate limits configured but no audit logging
    if (gov.rate_limits && !gov.audit) {
      findings.push({
        agentName: 'system',
        severity: 'INFO',
        code: 'RATE_LIMITS_NO_AUDIT',
        message:
          'Rate limits configured but audit logging is not enabled — consider adding governance.audit',
      })
    }

    // Path policies — check for overly permissive patterns
    if (gov.paths) {
      for (const [agentName, paths] of Object.entries(gov.paths)) {
        if (paths.allow?.includes('/**') && !paths.deny?.length) {
          findings.push({
            agentName,
            severity: 'WARN',
            code: 'PATH_POLICY_TOO_BROAD',
            message:
              'Path policy allows /** with no deny rules — effectively no restriction',
          })
        }
      }
    }
  }

  // ── Browser security ──────────────────────────────────────────────────────

  private checkBrowserSecurity(findings: AuditFinding[]): void {
    for (const agent of this.config.agents) {
      const browser = agent.capabilities.browser
      if (!browser) continue

      // Browser enabled without URL restrictions
      if (browser === true) {
        findings.push({
          agentName: agent.name,
          severity: 'INFO',
          code: 'BROWSER_NO_URL_POLICY',
          message:
            'Browser enabled with no URL allowlist/denylist — agent can navigate anywhere',
        })
      }

      // Browser with native runner (full host access + browser)
      if (agent.runner.env === 'native') {
        findings.push({
          agentName: agent.name,
          severity: 'WARN',
          code: 'BROWSER_NATIVE_MODE',
          message:
            'Browser + native runner = agent has browser + full host access — consider Docker isolation',
        })
      }
    }
  }

  // ── Dynamic checks ─────────────────────────────────────────────────────────

  private async checkBudgetAcceleration(
    _findings: AuditFinding[],
  ): Promise<void> {
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
    const recentEntries = logger
      .getRecent()
      .filter((e) => e.level === 'warn' && e.ts > oneHourAgo)

    // Count governance denial log entries per agent
    const denialCounts = new Map<string, number>()
    for (const entry of recentEntries) {
      if (entry.msg.includes('denied') || entry.msg.includes('blocked')) {
        // Try to extract agent name from tag or message
        for (const agent of this.config.agents) {
          if (
            entry.msg.includes(agent.name) ||
            entry.tag.includes(agent.name)
          ) {
            denialCounts.set(
              agent.name,
              (denialCounts.get(agent.name) ?? 0) + 1,
            )
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
