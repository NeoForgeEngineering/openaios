export interface RunInput {
  /** Agent name from config */
  agentName: string
  /** Unique session key (e.g. "telegram:12345678") */
  sessionKey: string
  /** Claude Code session ID for --resume, if resuming */
  claudeSessionId?: string
  /** User's message */
  message: string
  /** System prompt / persona */
  systemPrompt: string
  /** Absolute path to the agent's isolated workspace */
  workspaceDir: string
  /** Tools explicitly allowed for this agent */
  allowedTools: string[]
  /** Tools explicitly denied for this agent */
  deniedTools: string[]
  /** Model identifier (e.g. "claude-sonnet-4-5", "ollama/qwen2.5:7b") */
  model: string
}

export interface RunResult {
  /** Claude Code session ID — store for next turn's --resume */
  claudeSessionId: string
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

export type StreamChunkType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'cost' | 'error'

export interface StreamChunk {
  type: StreamChunkType
  /** Text content for 'text' chunks */
  text?: string
  /** Structured data for other chunk types */
  data?: unknown
}

export type RunnerMode = 'native' | 'docker'

export interface RunnerAdapter {
  /** Execute a turn, returning the full result */
  run(input: RunInput): Promise<RunResult>
  /** Execute a turn, yielding chunks as they arrive */
  runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult>
  /** Whether this runner supports --resume style session continuity */
  supportsSessionResume: boolean
  /** Check if the underlying runtime is reachable */
  healthCheck(): Promise<boolean>
  /** The mode this runner operates in */
  mode: RunnerMode
}
