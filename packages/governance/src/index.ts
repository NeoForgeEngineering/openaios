export { LocalGovernance } from './local.js'
export { BRGovernance } from './br.js'

import type { GovernanceAdapter } from '@openaios/core'
import { LocalGovernance } from './local.js'
import { BRGovernance } from './br.js'

interface AgentPermissions {
  allow: string[]
  deny: string[]
}

interface GovernanceOptions {
  agentPermissions: Record<string, AgentPermissions>
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
export function createGovernance(options: GovernanceOptions): GovernanceAdapter {
  const local = new LocalGovernance(options.agentPermissions)

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
