import type {
  AgentConfig,
  RunInput,
  RunnerAdapter,
  RunResult,
  StreamChunk,
} from '@openaios/core'

interface OllamaRunnerOptions {
  baseUrl?: string
}

/**
 * OllamaRunner — runs local models via the Ollama API.
 * Maintains conversation history in memory per session (no native session resume).
 */
export class OllamaRunner implements RunnerAdapter {
  readonly supportsSessionResume = false
  readonly env = 'native' as const
  private config: AgentConfig
  private readonly baseUrl: string
  /** In-memory conversation history keyed by sessionKey */
  private history = new Map<string, Array<{ role: string; content: string }>>()

  constructor(config: AgentConfig, options: OllamaRunnerOptions = {}) {
    this.config = config
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434'
  }

  async run(input: RunInput): Promise<RunResult> {
    const history = this.getHistory(input.sessionKey)
    history.push({ role: 'user', content: input.message })

    const model = this.resolveModel(
      input.modelOverride ?? this.config.defaultModel,
    )
    const messages = [
      { role: 'system', content: this.config.systemPrompt },
      ...history,
    ]

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    })

    if (!response.ok) {
      throw new Error(
        `Ollama API error ${response.status}: ${await response.text()}`,
      )
    }

    const data = (await response.json()) as {
      message: { content: string }
      eval_count?: number
      prompt_eval_count?: number
    }

    const output = data.message.content
    history.push({ role: 'assistant', content: output })
    this.history.set(input.sessionKey, history)

    return {
      output,
      model: `ollama/${model}`,
      ...(data.prompt_eval_count !== undefined && {
        inputTokens: data.prompt_eval_count,
      }),
      ...(data.eval_count !== undefined && { outputTokens: data.eval_count }),
    }
  }

  async *runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult> {
    const history = this.getHistory(input.sessionKey)
    history.push({ role: 'user', content: input.message })

    const model = this.resolveModel(
      input.modelOverride ?? this.config.defaultModel,
    )

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: this.config.systemPrompt },
          ...history,
        ],
        stream: true,
      }),
    })

    if (!response.ok || !response.body) {
      throw new Error(`Ollama API error ${response.status}`)
    }

    let fullOutput = ''
    const decoder = new TextDecoder()

    for await (const rawChunk of response.body) {
      const lines = decoder.decode(rawChunk as Uint8Array).split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const obj = JSON.parse(line) as {
            message?: { content: string }
            done?: boolean
          }
          if (obj.message?.content) {
            fullOutput += obj.message.content
            yield { type: 'text', text: obj.message.content }
          }
        } catch {
          // ignore partial lines
        }
      }
    }

    history.push({ role: 'assistant', content: fullOutput })
    this.history.set(input.sessionKey, history)

    return {
      output: fullOutput,
      model: `ollama/${model}`,
    }
  }

  reconfigure(config: AgentConfig): void {
    this.config = config
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  private resolveModel(model: string): string {
    return model.replace(/^ollama\//, '')
  }

  private getHistory(
    sessionKey: string,
  ): Array<{ role: string; content: string }> {
    if (!this.history.has(sessionKey)) {
      this.history.set(sessionKey, [])
    }
    return this.history.get(sessionKey) ?? []
  }
}
