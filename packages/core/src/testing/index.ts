import type {
  ChannelAdapter,
  ChannelTarget,
  InboundMessage,
  MessageHandler,
  OutboundMessage,
} from '../interfaces/channel.js'
import type {
  GovernanceAdapter,
  PolicyDecision,
  PolicyRequest,
  ToolUseEvent,
  TurnCostEvent,
} from '../interfaces/governance.js'
import type {
  AgentConfig,
  RunInput,
  RunnerAdapter,
  RunResult,
  StreamChunk,
} from '../interfaces/runner.js'
import type {
  Session,
  SessionKey,
  SessionStore,
} from '../interfaces/session.js'

// ---------------------------------------------------------------------------
// MockRunnerAdapter
// ---------------------------------------------------------------------------

export class MockRunner implements RunnerAdapter {
  supportsSessionResume = true
  env = 'native' as const
  calls: RunInput[] = []
  response: Partial<RunResult> = {}
  healthy = true

  async run(input: RunInput): Promise<RunResult> {
    this.calls.push(input)
    return {
      output: this.response.output ?? 'Mock response.',
      ...(this.response.costUsd !== undefined && {
        costUsd: this.response.costUsd,
      }),
      ...(this.response.inputTokens !== undefined && {
        inputTokens: this.response.inputTokens,
      }),
      ...(this.response.outputTokens !== undefined && {
        outputTokens: this.response.outputTokens,
      }),
      model: this.response.model ?? input.modelOverride ?? 'test-model',
    }
  }

  async *runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult> {
    this.calls.push(input)
    yield { type: 'text', text: 'Mock ' }
    yield { type: 'text', text: 'response.' }
    return {
      output: 'Mock response.',
      model: input.modelOverride ?? 'test-model',
    }
  }

  reconfigure(_config: AgentConfig): void {
    // no-op in mock
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
    this.store.set(
      this.key({ agentName: session.agentName, userId: session.userId }),
      session,
    )
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
