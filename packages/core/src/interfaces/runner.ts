export interface AgentConfig {
  agentName: string
  /** Fully resolved system prompt — persona + skills + memory hint */
  systemPrompt: string
  defaultModel: string
  premiumModel?: string
  allowedTools: string[]
  deniedTools: string[]
  /** Base directory; runner creates sessions/{sessionKey}/ within */
  workspacesDir: string
  memoryDir: string
}

export interface RunInput {
  /** Conversation thread identifier, e.g. "telegram:12345678" */
  sessionKey: string
  /** The user's message */
  message: string
  /**
   * Set by router when budget requires a model downgrade for this turn.
   * Runner uses this instead of its configured defaultModel.
   */
  modelOverride?: string
}

export interface RunResult {
  /** Final text output */
  output: string
  /** Cost in USD, if reported by the runner */
  costUsd?: number
  /** Input tokens used */
  inputTokens?: number
  /** Output tokens used */
  outputTokens?: number
  /** Actual model used (may differ if downgraded) */
  model: string
}

export type StreamChunkType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'cost'
  | 'error'

export interface StreamChunk {
  type: StreamChunkType
  /** Text content for 'text' chunks */
  text?: string
  /** Structured data for other chunk types */
  data?: unknown
}

export interface AgentBusRequest {
  fromAgent: string
  toAgent: string
  message: string
  /** Session key from the calling agent's turn */
  callerSessionKey: string
  /**
   * Set by the bus HTTP handler when the request was authenticated via a peer
   * inbound token rather than the local bus token. Signals that the allowedCallees
   * check should be skipped — authorization was already enforced at the HTTP layer.
   */
  inboundPeer?: string
}

export interface AgentBusResponse {
  output: string
  costUsd?: number
}

export interface AgentBus {
  request(req: AgentBusRequest): Promise<AgentBusResponse>
}

export type RunnerEnv = 'native' | 'docker' | 'external'

export interface RunnerAdapter {
  /** Execute a turn, returning the full result */
  run(input: RunInput): Promise<RunResult>
  /** Execute a turn, yielding chunks as they arrive */
  runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult>
  /** Whether this runner supports session continuity across turns */
  supportsSessionResume: boolean
  /** Check if the underlying runtime is reachable */
  healthCheck(): Promise<boolean>
  /** The environment this runner operates in */
  env: RunnerEnv
  /**
   * Hot-reload the agent's configuration (system prompt, tools, model).
   * Called when governance rules change — BR platform or local config update.
   * Takes effect on the next turn without losing session continuity.
   */
  reconfigure(config: AgentConfig): void
}
