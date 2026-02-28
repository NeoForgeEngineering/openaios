import type {
  GovernanceAdapter,
  PolicyDecision,
  PolicyRequest,
  ToolUseEvent,
  TurnCostEvent,
} from '@openaios/core'

interface AgentPermissions {
  allow: string[]
  deny: string[]
}

/**
 * LocalGovernance — config-file-driven, deny-by-default.
 *
 * Rules (in priority order):
 * 1. If the tool is in `deny` → DENY
 * 2. If `allow` is non-empty and the tool is NOT in `allow` → DENY
 * 3. If `allow` is empty (no allowlist configured) → DENY (deny-by-default)
 * 4. Tool is in `allow` → ALLOW
 */
export class LocalGovernance implements GovernanceAdapter {
  private permissions: Map<string, AgentPermissions>

  constructor(agentPermissions: Record<string, AgentPermissions>) {
    this.permissions = new Map(Object.entries(agentPermissions))
  }

  async checkPolicy(req: PolicyRequest): Promise<PolicyDecision> {
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
      return { allowed: true }
    }

    // Deny-by-default if allowlist is empty or tool is not in it
    if (perms.allow.length === 0 || !perms.allow.includes(req.tool)) {
      return {
        allowed: false,
        reason: `Tool "${req.tool}" is not in the allow list for agent "${req.agentName}"`,
      }
    }

    return { allowed: true }
  }

  reportToolUse(_event: ToolUseEvent): void {
    // Local governance: no-op. Extend to log to file or emit metrics if desired.
  }

  reportTurnCost(_event: TurnCostEvent): void {
    // Local governance: no-op. Budget tracking is handled by @openaios/budget.
  }
}
