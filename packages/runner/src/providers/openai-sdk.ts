import type {
  AgentConfig,
  RunInput,
  RunnerAdapter,
  RunnerEnv,
  RunResult,
  StreamChunk,
  ToolResult,
} from '@openaios/core'
import { logger } from '@openaios/core'
import type { ToolGate } from './anthropic-sdk.js'

export interface OpenAiSdkRunnerOptions {
  apiKey: string
  baseUrl?: string
  maxTokens?: number
  /** Governed tool executor — enables agentic tool-use loop */
  toolGate?: ToolGate
  /** Max tool-use iterations per turn (default 10) */
  maxToolRounds?: number
}

interface OMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

interface OResponse {
  choices: Array<{
    message: {
      content: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: string
  }>
  model: string
  usage?: { prompt_tokens: number; completion_tokens: number }
}

/**
 * OpenAI SDK runner with governed agentic tool-use loop.
 *
 * Same security model as AnthropicSdkRunner:
 * - Tools listed from registry, filtered by agent permissions
 * - tool_calls route through governed ToolExecutor
 * - Every call checked by governance.checkPolicy()
 * - No escape hatches
 */
export class OpenAiSdkRunner implements RunnerAdapter {
  readonly supportsSessionResume = false
  readonly env: RunnerEnv = 'native'
  private config: AgentConfig
  private options: OpenAiSdkRunnerOptions
  private history = new Map<string, OMessage[]>()
  private maxToolRounds: number

  constructor(config: AgentConfig, options: OpenAiSdkRunnerOptions) {
    this.config = config
    this.options = options
    this.maxToolRounds = options.maxToolRounds ?? 10
  }

  async run(input: RunInput): Promise<RunResult> {
    const model = input.modelOverride ?? this.config.defaultModel
    const maxTokens = this.options.maxTokens ?? 4096
    const baseUrl = this.options.baseUrl ?? 'https://api.openai.com/v1'
    const toolDefs = this.buildToolDefs()

    const messages = this.history.get(input.sessionKey) ?? []
    messages.push({ role: 'user', content: input.message })

    let totalIn = 0
    let totalOut = 0
    let finalModel = model

    const withSystem = (): OMessage[] => [
      { role: 'system', content: this.config.systemPrompt },
      ...messages,
    ]

    for (let round = 0; round <= this.maxToolRounds; round++) {
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages: withSystem(),
      }
      if (toolDefs.length > 0) {
        body.tools = toolDefs
      }

      const res = await this.callApi(baseUrl, body)
      finalModel = res.model
      if (res.usage) {
        totalIn += res.usage.prompt_tokens
        totalOut += res.usage.completion_tokens
      }

      const choice = res.choices[0]
      if (!choice) break

      const assistantMsg: OMessage = {
        role: 'assistant',
        content: choice.message.content,
        ...(choice.message.tool_calls !== undefined && {
          tool_calls: choice.message.tool_calls,
        }),
      }
      messages.push(assistantMsg)

      if (!choice.message.tool_calls || choice.finish_reason !== 'tool_calls') {
        this.history.set(input.sessionKey, messages)
        return {
          output: choice.message.content ?? '',
          model: finalModel,
          ...(totalIn > 0 && { inputTokens: totalIn }),
          ...(totalOut > 0 && { outputTokens: totalOut }),
        }
      }

      for (const tc of choice.message.tool_calls) {
        let parsedArgs: Record<string, unknown> = {}
        try {
          parsedArgs = JSON.parse(tc.function.arguments) as Record<
            string,
            unknown
          >
        } catch {
          /* invalid args */
        }

        const result = await this.execTool(tc.function.name, parsedArgs, input)
        logger.info(
          '[openai-sdk]',
          `Tool ${tc.function.name}: ${result.type === 'error' ? 'DENIED/FAILED' : 'OK'}`,
        )

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content:
            typeof result.content === 'string'
              ? result.content
              : JSON.stringify(result.content),
        })
      }
    }

    logger.warn(
      '[openai-sdk]',
      `Max tool rounds (${this.maxToolRounds}) exceeded`,
    )
    this.history.set(input.sessionKey, messages)
    return {
      output: 'I reached the maximum number of tool-use steps for this turn.',
      model: finalModel,
      ...(totalIn > 0 && { inputTokens: totalIn }),
      ...(totalOut > 0 && { outputTokens: totalOut }),
    }
  }

  private async callApi(
    baseUrl: string,
    body: Record<string, unknown>,
  ): Promise<OResponse> {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      throw new Error(`OpenAI API ${res.status}: ${await res.text()}`)
    }
    return (await res.json()) as OResponse
  }

  private async execTool(
    name: string,
    input: Record<string, unknown>,
    runInput: RunInput,
  ): Promise<ToolResult> {
    if (!this.options.toolGate) {
      return { type: 'error', content: `Tool execution not available: ${name}` }
    }
    return this.options.toolGate.execute(name, input, {
      sessionKey: runInput.sessionKey,
      agentName: this.config.agentName,
      workspaceDir: this.config.workspacesDir,
    })
  }

  private buildToolDefs(): Array<Record<string, unknown>> {
    if (!this.options.toolGate) return []
    const tools = this.options.toolGate.listForAgent(this.config)
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.inputSchema),
      },
    }))
  }

  async *runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult> {
    const result = await this.run(input)
    yield { type: 'text', text: result.output }
    return result
  }

  reconfigure(config: AgentConfig): void {
    this.config = config
  }

  async healthCheck(): Promise<boolean> {
    try {
      const baseUrl = this.options.baseUrl ?? 'https://api.openai.com/v1'
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
        signal: AbortSignal.timeout(5000),
      })
      return res.ok
    } catch {
      return false
    }
  }
}

function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  try {
    const def = (schema as Record<string, unknown>)?._def as
      | Record<string, unknown>
      | undefined
    if (!def) return { type: 'object' }
    if (def.typeName !== 'ZodObject') return { type: 'object' }
    const shape = def.shape as (() => Record<string, unknown>) | undefined
    if (typeof shape !== 'function') return { type: 'object' }
    const fields = shape()
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, fs] of Object.entries(fields)) {
      const fd = (fs as Record<string, unknown>)?._def as
        | Record<string, unknown>
        | undefined
      const ft = fd?.typeName as string | undefined
      if (ft === 'ZodOptional') {
        const inner = (fd?.innerType as Record<string, unknown>)?._def as
          | Record<string, unknown>
          | undefined
        properties[key] = typeFromZodName(inner?.typeName as string | undefined)
      } else {
        properties[key] = typeFromZodName(ft)
        required.push(key)
      }
    }
    return {
      type: 'object',
      properties,
      ...(required.length > 0 && { required }),
    }
  } catch {
    return { type: 'object' }
  }
}

function typeFromZodName(name: string | undefined): Record<string, unknown> {
  switch (name) {
    case 'ZodString':
      return { type: 'string' }
    case 'ZodNumber':
      return { type: 'number' }
    case 'ZodBoolean':
      return { type: 'boolean' }
    case 'ZodArray':
      return { type: 'array' }
    default:
      return {}
  }
}
