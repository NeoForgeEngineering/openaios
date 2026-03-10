import type {
  AgentConfig,
  RunInput,
  RunnerAdapter,
  RunResult,
  StreamChunk,
} from '@openaios/core'

interface OpenAICompatRunnerOptions {
  apiKey: string
  baseUrl?: string
}

/**
 * OpenAICompatRunner — works with any OpenAI-compatible API.
 * Covers: OpenRouter, Groq, Mistral, Together, custom endpoints, etc.
 */
export class OpenAICompatRunner implements RunnerAdapter {
  readonly supportsSessionResume = false
  readonly env = 'native' as const
  private config: AgentConfig
  private readonly apiKey: string
  private readonly baseUrl: string
  private history = new Map<string, Array<{ role: string; content: string }>>()

  constructor(config: AgentConfig, options: OpenAICompatRunnerOptions) {
    this.config = config
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com').replace(
      /\/$/,
      '',
    )
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

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: false }),
    })

    if (!response.ok) {
      throw new Error(
        `OpenAI-compat API error ${response.status}: ${await response.text()}`,
      )
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>
      usage?: { prompt_tokens: number; completion_tokens: number }
      model: string
    }

    const output = data.choices[0]?.message.content ?? ''
    history.push({ role: 'assistant', content: output })
    this.history.set(input.sessionKey, history)

    return {
      output,
      model: data.model,
      ...(data.usage?.prompt_tokens !== undefined && {
        inputTokens: data.usage.prompt_tokens,
      }),
      ...(data.usage?.completion_tokens !== undefined && {
        outputTokens: data.usage.completion_tokens,
      }),
    }
  }

  async *runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult> {
    const history = this.getHistory(input.sessionKey)
    history.push({ role: 'user', content: input.message })

    const model = this.resolveModel(
      input.modelOverride ?? this.config.defaultModel,
    )
    const messages = [
      { role: 'system', content: this.config.systemPrompt },
      ...history,
    ]

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
    })

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI-compat API error ${response.status}`)
    }

    let fullOutput = ''
    const decoder = new TextDecoder()

    for await (const rawChunk of response.body) {
      const lines = decoder.decode(rawChunk as Uint8Array).split('\n')
      for (const line of lines) {
        const trimmed = line.replace(/^data: /, '').trim()
        if (!trimmed || trimmed === '[DONE]') continue
        try {
          const obj = JSON.parse(trimmed) as {
            choices: Array<{ delta?: { content?: string } }>
          }
          const content = obj.choices[0]?.delta?.content ?? ''
          if (content) {
            fullOutput += content
            yield { type: 'text', text: content }
          }
        } catch {
          // ignore
        }
      }
    }

    history.push({ role: 'assistant', content: fullOutput })
    this.history.set(input.sessionKey, history)

    return {
      output: fullOutput,
      model,
    }
  }

  reconfigure(config: AgentConfig): void {
    this.config = config
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(3000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  private resolveModel(model: string): string {
    // Strip provider prefix like "groq/" or "openrouter/"
    return model.replace(/^[^/]+\//, '') || this.config.defaultModel
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
