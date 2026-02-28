export interface PolicyRequest {
  agentName: string
  sessionKey: string
  tool: string
  /** Tool input parameters */
  input: Record<string, unknown>
}

export type PolicyDecision =
  | { allowed: true; reason?: string }
  | { allowed: false; reason: string }

export interface ToolUseEvent {
  agentName: string
  sessionKey: string
  tool: string
  input: Record<string, unknown>
  decision: PolicyDecision
  timestampMs: number
}

export interface TurnCostEvent {
  agentName: string
  sessionKey: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  model: string
  timestampMs: number
}

export interface GovernanceAdapter {
  /**
   * Check whether a tool call is permitted.
   * Must resolve within 200ms; fail-open (allow) on timeout.
   */
  checkPolicy(req: PolicyRequest): Promise<PolicyDecision>

  /** Fire-and-forget: report a tool use event for audit/rate-limiting */
  reportToolUse(event: ToolUseEvent): void

  /** Fire-and-forget: report turn cost for budget reconciliation */
  reportTurnCost(event: TurnCostEvent): void
}
