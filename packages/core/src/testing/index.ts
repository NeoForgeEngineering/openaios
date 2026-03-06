import type { ChannelAdapter, ChannelTarget, InboundMessage, MessageHandler, OutboundMessage } from '../interfaces/channel.js'
import type { GovernanceAdapter, PolicyDecision, PolicyRequest, TurnCostEvent, ToolUseEvent } from '../interfaces/governance.js'
import type { RunInput, RunResult, RunnerAdapter, StreamChunk } from '../interfaces/runner.js'
import type { Session, SessionKey, SessionStore } from '../interfaces/session.js'

// ---------------------------------------------------------------------------
// MockRunnerAdapter
// ---------------------------------------------------------------------------

export class MockRunner implements RunnerAdapter {
  supportsSessionResume = true
  mode = 'native' as const
  calls: RunInput[] = []
  response: Partial<RunResult> = {}
  healthy = true

  async run(input: RunInput): Promise<RunResult> {
    this.calls.push(input)
    return {
      claudeSessionId: this.response.claudeSessionId ?? 'mock-session-id',
      output: this.response.output ?? 'Mock response.',
      costUsd: this.response.costUsd ?? 0.001,
      inputTokens: this.response.inputTokens ?? 100,
      outputTokens: this.response.outputTokens ?? 50,
      model: this.response.model ?? input.model,
    }
  }

  async *runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult> {
    this.calls.push(input)
    yield { type: 'text', text: 'Mock ' }
    yield { type: 'text', text: 'response.' }
    return {
      claudeSessionId: 'mock-session-id',
      output: 'Mock response.',
      costUsd: 0.001,
      inputTokens: 100,
      outputTokens: 50,
      model: input.model,
    }
  }

  async healthCheck(): Promise<boolean> {
    return this.healthy
  }
}

// ---------------------------------------------------------------------------
// MockGovernanceAdapter
// ---------------------------------------------------------------------------

export class MockGovernance implements GovernanceAdapter {
  decision: PolicyDecision = { allowed: true }
  toolUseEvents: ToolUseEvent[] = []
  turnCostEvents: TurnCostEvent[] = []

  async checkPolicy(_req: PolicyRequest): Promise<PolicyDecision> {
    return this.decision
  }

  reportToolUse(event: ToolUseEvent): void {
    this.toolUseEvents.push(event)
  }

  reportTurnCost(event: TurnCostEvent): void {
    this.turnCostEvents.push(event)
  }
}

// ---------------------------------------------------------------------------
// MockSessionStore
// ---------------------------------------------------------------------------

export class MockSessionStore implements SessionStore {
  private store = new Map<string, Session>()

  private key(k: SessionKey): string {
    return `${k.agentName}:${k.userId}`
  }

  async get(key: SessionKey): Promise<Session | undefined> {
    return this.store.get(this.key(key))
  }

  async set(session: Session): Promise<void> {
    this.store.set(this.key({ agentName: session.agentName, userId: session.userId }), session)
  }

  async delete(key: SessionKey): Promise<void> {
    this.store.delete(this.key(key))
  }

  async listByAgent(agentName: string): Promise<Session[]> {
    return [...this.store.values()].filter((s) => s.agentName === agentName)
  }

  async listAll(): Promise<Session[]> {
    return [...this.store.values()]
  }
}

// ---------------------------------------------------------------------------
// MockChannelAdapter
// ---------------------------------------------------------------------------

export class MockChannel implements ChannelAdapter {
  readonly channelType = 'mock'
  sent: Array<{ target: ChannelTarget; msg: OutboundMessage }> = []
  private handler?: MessageHandler
  running = false

  async start(): Promise<void> {
    this.running = true
  }

  async stop(): Promise<void> {
    this.running = false
  }

  async send(target: ChannelTarget, msg: OutboundMessage): Promise<void> {
    this.sent.push({ target, msg })
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }

  /** Simulate an inbound message for testing */
  async simulateMessage(message: InboundMessage): Promise<void> {
    if (!this.handler) throw new Error('No message handler registered')
    await this.handler(message)
  }
}
