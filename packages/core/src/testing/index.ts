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
import type { MemoryAdapter, MemoryEntry } from '../interfaces/memory.js'
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
import type {
  ToolContext,
  ToolDefinition,
  ToolResult,
} from '../interfaces/tool.js'

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

// ---------------------------------------------------------------------------
// MockToolRegistry
// ---------------------------------------------------------------------------

export class MockToolRegistry {
  private tools = new Map<string, ToolDefinition>()
  addCalls: ToolDefinition[] = []
  executeCalls: Array<{ name: string; input: unknown; ctx: ToolContext }> = []
  executeResult: ToolResult = { type: 'text', content: 'mock result' }

  add(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`)
    }
    this.addCalls.push(tool)
    this.tools.set(tool.name, tool)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  remove(name: string): boolean {
    return this.tools.delete(name)
  }
}

// ---------------------------------------------------------------------------
// MockMemoryStore
// ---------------------------------------------------------------------------

export class MockMemoryStore implements MemoryAdapter {
  private entries = new Map<string, MemoryEntry>()

  private scopedKey(agentName: string, key: string): string {
    return `${agentName}:${key}`
  }

  async store(
    agentName: string,
    key: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date().toISOString()
    const existing = this.entries.get(this.scopedKey(agentName, key))
    this.entries.set(this.scopedKey(agentName, key), {
      key,
      content,
      ...(metadata !== undefined && { metadata }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
  }

  async search(
    agentName: string,
    query: string,
    opts?: { topK?: number; minScore?: number },
  ): Promise<MemoryEntry[]> {
    const topK = opts?.topK ?? 5
    const results: MemoryEntry[] = []
    for (const [k, v] of this.entries) {
      if (k.startsWith(`${agentName}:`)) {
        const score = v.content.toLowerCase().includes(query.toLowerCase())
          ? 1.0
          : 0.1
        if (opts?.minScore !== undefined && score < opts.minScore) continue
        results.push({ ...v, score })
      }
    }
    return results
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, topK)
  }

  async get(agentName: string, key: string): Promise<MemoryEntry | undefined> {
    return this.entries.get(this.scopedKey(agentName, key))
  }

  async delete(agentName: string, key: string): Promise<void> {
    this.entries.delete(this.scopedKey(agentName, key))
  }

  async buildPromptContext(
    agentName: string,
    query: string,
    maxTokens: number,
  ): Promise<string> {
    const memories = await this.search(agentName, query)
    if (memories.length === 0) return ''
    const lines = memories.map((m) => `- [${m.key}] ${m.content}`)
    const full = lines.join('\n')
    const maxChars = maxTokens * 4
    return full.length > maxChars ? full.slice(0, maxChars) : full
  }

  close(): void {
    // no-op
  }
}
