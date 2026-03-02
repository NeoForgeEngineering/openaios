import { join } from 'node:path'
import type {
  AgentBus as AgentBusInterface,
  AgentBusRequest,
  AgentBusResponse,
  GovernanceAdapter,
  RunnerAdapter,
  Session,
  SessionStore,
} from '@openaios/core'
import type { BudgetManager } from '@openaios/budget'

export interface AgentBusEntry {
  runner: RunnerAdapter
  systemPrompt: string
  defaultModel: string
  allowedTools: string[]
  deniedTools: string[]
  workspacesDir: string
  /** Agent names this agent is explicitly permitted to call */
  allowedCallees: string[]
}

export class AgentNotFoundError extends Error {
  constructor(agentName: string) {
    super(`Agent "${agentName}" is not registered on the bus`)
    this.name = 'AgentNotFoundError'
  }
}

export class AgentCallDeniedError extends Error {
  constructor(from: string, to: string, reason: string) {
    super(`Agent "${from}" is not permitted to call "${to}": ${reason}`)
    this.name = 'AgentCallDeniedError'
  }
}

/**
 * In-process governed request/response bus between agents.
 *
 * Governance layers (both must pass):
 *  1. GovernanceAdapter.checkPolicy — treats call_agent as a regular tool
 *  2. allowedCallees — explicit callee allowlist from capabilities config
 */
export class AgentBus implements AgentBusInterface {
  private readonly agents = new Map<string, AgentBusEntry>()
  private readonly governance: GovernanceAdapter
  private readonly sessionStore: SessionStore
  private readonly budget: BudgetManager

  constructor(opts: {
    governance: GovernanceAdapter
    sessionStore: SessionStore
    budget: BudgetManager
  }) {
    this.governance = opts.governance
    this.sessionStore = opts.sessionStore
    this.budget = opts.budget
  }

  register(agentName: string, entry: AgentBusEntry): void {
    this.agents.set(agentName, entry)
  }

  async request(req: AgentBusRequest): Promise<AgentBusResponse> {
    // 1. Validate target agent exists
    const entry = this.agents.get(req.toAgent)
    if (!entry) {
      throw new AgentNotFoundError(req.toAgent)
    }

    // 2. Governance check — call_agent treated as a tool
    const decision = await this.governance.checkPolicy({
      agentName: req.fromAgent,
      sessionKey: req.callerSessionKey,
      tool: 'call_agent',
      input: { toAgent: req.toAgent, message: req.message },
    })
    if (!decision.allowed) {
      throw new AgentCallDeniedError(req.fromAgent, req.toAgent, decision.reason)
    }

    // 3. Check allowedCallees as a second layer
    const fromEntry = this.agents.get(req.fromAgent)
    if (fromEntry && !fromEntry.allowedCallees.includes(req.toAgent)) {
      throw new AgentCallDeniedError(
        req.fromAgent,
        req.toAgent,
        `"${req.toAgent}" is not in allowedCallees for "${req.fromAgent}"`
      )
    }

    // 4. Budget check for the callee
    const budgetCheck = this.budget.check(req.toAgent, entry.defaultModel)
    if (!budgetCheck.allowed) {
      throw new Error(
        `Budget exceeded for agent "${req.toAgent}": ${budgetCheck.reason ?? 'limit reached'}`
      )
    }

    const effectiveModel = budgetCheck.effectiveModel ?? entry.defaultModel

    // 5. Load or create session for the callee scoped to this caller session
    const sessionKey = {
      agentName: req.toAgent,
      userId: `bus:${req.fromAgent}:${req.callerSessionKey}`,
    }
    const session: Session | undefined = await this.sessionStore.get(sessionKey)

    // 6. Execute turn
    const result = await entry.runner.run({
      agentName: req.toAgent,
      sessionKey: sessionKey.userId,
      ...(session?.claudeSessionId !== undefined && { claudeSessionId: session.claudeSessionId }),
      message: req.message,
      systemPrompt: entry.systemPrompt,
      workspaceDir: join(entry.workspacesDir, req.toAgent),
      allowedTools: entry.allowedTools,
      deniedTools: entry.deniedTools,
      model: effectiveModel,
    })

    // 7. Persist session
    const now = Date.now()
    await this.sessionStore.set({
      agentName: req.toAgent,
      userId: sessionKey.userId,
      claudeSessionId: result.claudeSessionId,
      currentModel: effectiveModel,
      totalCostUsd: (session?.totalCostUsd ?? 0) + (result.costUsd ?? 0),
      createdAt: session?.createdAt ?? now,
      updatedAt: now,
    })

    // 8. Record budget for callee
    if (result.costUsd) {
      this.budget.record(req.toAgent, result.costUsd, result.inputTokens, result.outputTokens)
    }

    // 9. Report to governance (fire-and-forget)
    this.governance.reportToolUse({
      agentName: req.fromAgent,
      sessionKey: req.callerSessionKey,
      tool: 'call_agent',
      input: { toAgent: req.toAgent },
      decision: { allowed: true },
      timestampMs: Date.now(),
    })

    if (result.costUsd) {
      this.governance.reportTurnCost({
        agentName: req.toAgent,
        sessionKey: sessionKey.userId,
        costUsd: result.costUsd,
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
        model: effectiveModel,
        timestampMs: Date.now(),
      })
    }

    return {
      output: result.output,
      ...(result.costUsd !== undefined && { costUsd: result.costUsd }),
    }
  }
}
