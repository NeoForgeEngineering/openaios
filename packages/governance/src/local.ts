import type {
  GovernanceAdapter,
  PolicyDecision,
  PolicyRequest,
  ToolUseEvent,
  TurnCostEvent,
} from '@openaios/core'
import type { AuditLog } from './audit-log.js'
import type { PathPolicy } from './path-policy.js'
import type { RateLimiter } from './rate-limiter.js'

interface AgentPermissions {
  allow: string[]
  deny: string[]
}

export interface LocalGovernanceOptions {
  agentPermissions: Record<string, AgentPermissions>
  pathPolicy?: PathPolicy
  rateLimiter?: RateLimiter
  auditLog?: AuditLog
}

/**
 * LocalGovernance — config-file-driven, deny-by-default.
 *
 * Rules (in priority order):
 * 1. Rate limiter check (if configured)
 * 2. If the tool is in `deny` → DENY
 * 3. If `allow` is non-empty and the tool is NOT in `allow` → DENY
 * 4. If `allow` is empty (no allowlist configured) → DENY (deny-by-default)
 * 5. Path policy check for file-access tools (if configured)
 * 6. Tool is in `allow` → ALLOW
 */
export class LocalGovernance implements GovernanceAdapter {
  private permissions: Map<string, AgentPermissions>
  private pathPolicy?: PathPolicy
  private rateLimiter?: RateLimiter
  private auditLog?: AuditLog

  constructor(
    optsOrPerms: LocalGovernanceOptions | Record<string, AgentPermissions>,
  ) {
    if ('agentPermissions' in optsOrPerms) {
      const opts = optsOrPerms as LocalGovernanceOptions
      this.permissions = new Map(Object.entries(opts.agentPermissions))
      if (opts.pathPolicy !== undefined) this.pathPolicy = opts.pathPolicy
      if (opts.rateLimiter !== undefined) this.rateLimiter = opts.rateLimiter
      if (opts.auditLog !== undefined) this.auditLog = opts.auditLog
    } else {
      // Backward compat: plain Record<string, AgentPermissions>
      this.permissions = new Map(Object.entries(optsOrPerms))
    }
  }

  async checkPolicy(req: PolicyRequest): Promise<PolicyDecision> {
    // Rate limiter check
    if (this.rateLimiter) {
      const allowed = this.rateLimiter.consume(req.agentName)
      if (!allowed) {
        const decision: PolicyDecision = {
          allowed: false,
          reason: `Rate limit exceeded for agent "${req.agentName}"`,
        }
        this.auditLog?.log({
          agentName: req.agentName,
          sessionKey: req.sessionKey,
          eventType: 'rate_limit',
          tool: req.tool,
          detail: decision.reason,
          timestampMs: Date.now(),
        })
        return decision
      }
    }

    const perms = this.permissions.get(req.agentName)

    if (!perms) {
      return {
        allowed: false,
        reason: `No permissions configured for agent "${req.agentName}" — deny-by-default`,
      }
    }

    // Deny list takes precedence
    if (perms.deny.includes(req.tool) || perms.deny.includes('*')) {
      return {
        allowed: false,
        reason: `Tool "${req.tool}" is in the deny list for agent "${req.agentName}"`,
      }
    }

    // Wildcard allow
    if (perms.allow.includes('*')) {
      return this.checkPathPolicy(req)
    }

    // Deny-by-default if allowlist is empty or tool is not in it
    if (perms.allow.length === 0 || !perms.allow.includes(req.tool)) {
      return {
        allowed: false,
        reason: `Tool "${req.tool}" is not in the allow list for agent "${req.agentName}"`,
      }
    }

    return this.checkPathPolicy(req)
  }

  private checkPathPolicy(req: PolicyRequest): PolicyDecision {
    if (!this.pathPolicy) return { allowed: true }

    // Check if input contains a path-like field
    const path =
      typeof req.input.path === 'string'
        ? req.input.path
        : typeof req.input.file_path === 'string'
          ? req.input.file_path
          : undefined

    if (path === undefined) return { allowed: true }

    const result = this.pathPolicy.check(req.agentName, path)
    if (!result.allowed) {
      this.auditLog?.log({
        agentName: req.agentName,
        sessionKey: req.sessionKey,
        eventType: 'policy_deny',
        tool: req.tool,
        detail: result.reason ?? 'Path denied',
        timestampMs: Date.now(),
      })
      return { allowed: false, reason: result.reason ?? 'Path denied' }
    }

    return { allowed: true }
  }

  reportToolUse(event: ToolUseEvent): void {
    this.auditLog?.log({
      agentName: event.agentName,
      sessionKey: event.sessionKey,
      eventType: 'tool_use',
      tool: event.tool,
      detail: event.decision.allowed
        ? 'allowed'
        : `denied: ${event.decision.reason}`,
      timestampMs: event.timestampMs,
    })
  }

  reportTurnCost(event: TurnCostEvent): void {
    this.auditLog?.log({
      agentName: event.agentName,
      sessionKey: event.sessionKey,
      eventType: 'turn_cost',
      detail: `$${event.costUsd.toFixed(4)} ${event.model} (${event.inputTokens}/${event.outputTokens} tokens)`,
      timestampMs: event.timestampMs,
    })
  }
}
