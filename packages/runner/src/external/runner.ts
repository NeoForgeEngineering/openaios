import type {
  AgentConfig,
  RunInput,
  RunnerAdapter,
  RunResult,
  StreamChunk,
} from '@openaios/core'

interface ExternalRunnerOptions {
  /** OpenAI-compat chat completions base URL, e.g. http://localhost:18789/v1 */
  baseUrl: string
  /** API key presented as Bearer token (optional) */
  apiKey?: string
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface SSEDelta {
  content?: string
}

interface SSEChoice {
  delta?: SSEDelta
  finish_reason?: string | null
}

interface SSEChunk {
  choices?: SSEChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
  }
}

/**
 * ExternalAgentRunner — sends turns to any OpenAI-compat chat completions API.
 *
 * Session continuity is maintained in-process via a per-sessionKey message
 * history. The system prompt (persona + tool advisories) is injected once at
 * the start of each session. Budget enforcement, governance, and cost recording
 * all happen in RouterCore — this runner is just the execution adapter.
 */
export class ExternalAgentRunner implements RunnerAdapter {
  readonly supportsSessionResume = true
  readonly env = 'external' as const
  private config: AgentConfig
  private readonly baseUrl: string
  private readonly apiKey: string
  /** sessionKey → conversation history */
  private readonly histories = new Map<string, ChatMessage[]>()

  constructor(config: AgentConfig, options: ExternalRunnerOptions) {
    this.config = config
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.apiKey = options.apiKey ?? ''
  }

  async run(input: RunInput): Promise<RunResult> {
    const chunks: StreamChunk[] = []
    const gen = this.runStreaming(input)
    let next = await gen.next()
    while (!next.done) {
      chunks.push(next.value)
      next = await gen.next()
    }
    return next.value
  }

  async *runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult> {
    const model = input.modelOverride ?? this.config.defaultModel
    const history = this.histories.get(input.sessionKey) ?? []

    // Build message list — system prompt only on the first turn
    const messages: ChatMessage[] =
      history.length === 0
        ? [{ role: 'system', content: this.buildSystemPrompt() }, ...history]
        : [...history]

    messages.push({ role: 'user', content: input.message })

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `External agent returned ${response.status}: ${body.slice(0, 300)}`,
      )
    }

    if (!response.body) {
      throw new Error('External agent response has no body')
    }

    let fullText = ''
    let inputTokens: number | undefined
    let outputTokens: number | undefined

    for await (const chunk of parseSSEChunks(response.body)) {
      const text = chunk.choices?.[0]?.delta?.content
      if (text) {
        fullText += text
        yield { type: 'text', text }
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens
        outputTokens = chunk.usage.completion_tokens
      }
    }

    // Persist updated history for next turn
    this.histories.set(input.sessionKey, [
      ...messages,
      { role: 'assistant', content: fullText },
    ])

    return {
      output: fullText,
      model,
      ...(inputTokens !== undefined && { inputTokens }),
      ...(outputTokens !== undefined && { outputTokens }),
      // costUsd omitted — OpenAI-compat APIs don't report it;
      // RouterCore handles missing costUsd gracefully (records $0)
    }
  }

  reconfigure(config: AgentConfig): void {
    this.config = config
    // History is kept — reconfigure only affects future system prompts
    // on new sessions; existing sessions continue with their current history
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(3000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  /**
   * Build the system prompt that opens every new session.
   * Embeds persona, tool advisories, and memory hint.
   */
  private buildSystemPrompt(): string {
    const lines: string[] = [this.config.systemPrompt]

    if (this.config.allowedTools.length > 0) {
      lines.push(
        `\nYou may only use these tools: ${this.config.allowedTools.join(', ')}.`,
      )
    }
    if (this.config.deniedTools.length > 0) {
      lines.push(
        `You must never use these tools: ${this.config.deniedTools.join(', ')}.`,
      )
    }

    return lines.join('\n')
  }
}

/**
 * Parse a streaming OpenAI-compat SSE response body.
 * Yields each parsed data chunk; stops on `data: [DONE]`.
 */
async function* parseSSEChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let partial = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      partial += decoder.decode(value, { stream: true })
      const lines = partial.split('\n')
      partial = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') return
        try {
          yield JSON.parse(data) as SSEChunk
        } catch {
          // Malformed chunk — skip
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
