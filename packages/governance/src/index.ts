export { type AuditEntry, AuditLog } from './audit-log.js'
export { BRGovernance } from './br.js'
export { LocalGovernance, type LocalGovernanceOptions } from './local.js'
export { PairingManager } from './pairing.js'
export { PathPolicy } from './path-policy.js'
export { RateLimiter } from './rate-limiter.js'

import type { GovernanceAdapter } from '@openaios/core'
import type { AuditLog } from './audit-log.js'
import { BRGovernance } from './br.js'
import { LocalGovernance } from './local.js'
import type { PathPolicy } from './path-policy.js'
import type { RateLimiter } from './rate-limiter.js'

interface AgentPermissions {
  allow: string[]
  deny: string[]
}

interface GovernanceOptions {
  agentPermissions: Record<string, AgentPermissions>
  pathPolicy?: PathPolicy
  rateLimiter?: RateLimiter
  auditLog?: AuditLog
  br?: {
    url: string
    token: string
    failSecure?: boolean
  }
}

/**
 * Factory: returns LocalGovernance, BRGovernance, or a composited adapter
 * that checks local rules first then BR.
 */
export function createGovernance(
  options: GovernanceOptions,
): GovernanceAdapter {
  const local = new LocalGovernance({
    agentPermissions: options.agentPermissions,
    ...(options.pathPolicy !== undefined && { pathPolicy: options.pathPolicy }),
    ...(options.rateLimiter !== undefined && {
      rateLimiter: options.rateLimiter,
    }),
    ...(options.auditLog !== undefined && { auditLog: options.auditLog }),
  })

  if (!options.br) {
    return local
  }

  const br = new BRGovernance(options.br)

  // Composed: local deny overrides BR, but local allow still defers to BR
  return {
    async checkPolicy(req) {
      const localDecision = await local.checkPolicy(req)
      if (!localDecision.allowed) return localDecision
      return br.checkPolicy(req)
    },
    reportToolUse(event) {
      local.reportToolUse(event)
      br.reportToolUse(event)
    },
    reportTurnCost(event) {
      local.reportTurnCost(event)
      br.reportTurnCost(event)
    },
  }
}
