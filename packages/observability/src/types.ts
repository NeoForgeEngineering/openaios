/** A single agent turn — the atomic unit of observability */
export interface TurnRecord {
  id?: number
  agentName: string
  sessionKey: string
  channel: string
  model: string
  /** User's input message */
  userMessage: string
  /** Agent's output message */
  agentMessage: string
  /** Tools called during this turn */
  toolCalls?: ToolCallRecord[]
  /** Token counts */
  inputTokens: number
  outputTokens: number
  /** Cost in USD */
  costUsd: number
  /** Turn duration in ms */
  durationMs: number
  /** Timestamp */
  timestampMs: number
}

export interface ToolCallRecord {
  tool: string
  input: string
  output: string
  allowed: boolean
  durationMs: number
}

/** Aggregated metrics for a time period */
export interface MetricsSummary {
  agentName: string
  period: string
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  avgDurationMs: number
  toolCalls: number
  errors: number
}

/** Chat message for conversation history */
export interface ChatMessage {
  id?: number
  agentName: string
  sessionKey: string
  role: 'user' | 'assistant'
  content: string
  model?: string
  tokens?: number
  costUsd?: number
  timestampMs: number
}

/** BR forwarding config */
export interface BRForwardConfig {
  url: string
  token: string
  /** Batch size before flushing to BR */
  batchSize?: number
  /** Max interval between flushes (ms) */
  flushIntervalMs?: number
}
