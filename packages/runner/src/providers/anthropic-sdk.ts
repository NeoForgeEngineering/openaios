import type {
  AgentConfig,
  RunInput,
  RunnerAdapter,
  RunnerEnv,
  RunResult,
  StreamChunk,
  ToolContext,
  ToolResult,
} from '@openaios/core'
import { logger } from '@openaios/core'

export interface ToolGate {
  execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult>
  listForAgent(
    config: AgentConfig,
  ): Array<{ name: string; description: string; inputSchema: unknown }>
}

export interface AnthropicSdkRunnerOptions {
  apiKey: string
  baseUrl?: string
  maxTokens?: number
  /** Governed tool executor — enables agentic tool-use loop */
  toolGate?: ToolGate
  /** Max tool-use iterations per turn (default 10) */
  maxToolRounds?: number
}

interface AMessage {
  role: 'user' | 'assistant'
  content: string | ABlock[]
}

type ABlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use'
      id: string
      name: string
      input: Record<string, unknown>
    }
  | { type: 'tool_result'; tool_use_id: string; content: string }

interface AResponse {
  content: ABlock[]
  model: string
  stop_reason: string
  usage?: { input_tokens: number; output_tokens: number }
}

/**
 * Anthropic SDK runner with governed agentic tool-use loop.
 *
 * When toolGate is provided:
 * 1. Allowed tools are sent to the LLM as available tools
 * 2. tool_use responses route through the governed ToolExecutor
 * 3. ToolExecutor calls governance.checkPolicy() before every execution
 * 4. Results feed back to the LLM
 * 5. Loop continues until end_turn or max rounds
 *
 * Every tool call is governed — no escape hatches.
 */
export class AnthropicSdkRunner implements RunnerAdapter {
  readonly supportsSessionResume = false
  readonly env: RunnerEnv = 'native'
  private config: AgentConfig
  private options: AnthropicSdkRunnerOptions
  private history = new Map<string, AMessage[]>()
  private maxToolRounds: number

  constructor(config: AgentConfig, options: AnthropicSdkRunnerOptions) {
    this.config = config
    this.options = options
    this.maxToolRounds = options.maxToolRounds ?? 10
  }

  async run(input: RunInput): Promise<RunResult> {
    const model = input.modelOverride ?? this.config.defaultModel
    const maxTokens = this.options.maxTokens ?? 4096
    const baseUrl = this.options.baseUrl ?? 'https://api.anthropic.com'
    const tools = this.options.toolGate?.listForAgent(this.config) ?? []

    const messages = this.history.get(input.sessionKey) ?? []
    messages.push({ role: 'user', content: input.message })

    let totalIn = 0
    let totalOut = 0
    let finalModel = model

    for (let round = 0; round <= this.maxToolRounds; round++) {
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        system: this.config.systemPrompt,
        messages,
      }
      if (tools.length > 0) {
        body.tools = tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: zodToJsonSchema(t.inputSchema),
        }))
      }

      const res = await this.callApi(baseUrl, body)
      finalModel = res.model
      if (res.usage) {
        totalIn += res.usage.input_tokens
        totalOut += res.usage.output_tokens
      }

      messages.push({ role: 'assistant', content: res.content })

      // No tool use → extract text and return
      if (res.stop_reason !== 'tool_use') {
        const output = res.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('')

        this.history.set(input.sessionKey, messages)
        return {
          output,
          model: finalModel,
          ...(totalIn > 0 && { inputTokens: totalIn }),
          ...(totalOut > 0 && { outputTokens: totalOut }),
        }
      }

      // Route tool calls through governed executor
      const toolBlocks = res.content.filter(
        (
          c,
        ): c is {
          type: 'tool_use'
          id: string
          name: string
          input: Record<string, unknown>
        } => c.type === 'tool_use',
      )

      const results: ABlock[] = []
      for (const tu of toolBlocks) {
        const result = await this.execTool(tu.name, tu.input, input)
        logger.info(
          '[anthropic-sdk]',
          `Tool ${tu.name}: ${result.type === 'error' ? 'DENIED/FAILED' : 'OK'}`,
        )
        results.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content:
            typeof result.content === 'string'
              ? result.content
              : JSON.stringify(result.content),
        })
      }

      messages.push({ role: 'user', content: results })
    }

    logger.warn(
      '[anthropic-sdk]',
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
  ): Promise<AResponse> {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${await res.text()}`)
    }
    return (await res.json()) as AResponse
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
      const baseUrl = this.options.baseUrl ?? 'https://api.anthropic.com'
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.defaultModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: AbortSignal.timeout(10_000),
      })
      return res.ok
    } catch {
      return false
    }
  }
}

/** Basic Zod → JSON Schema conversion for tool input_schema */
function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  try {
    const def = (schema as Record<string, unknown>)?._def as
      | Record<string, unknown>
      | undefined
    if (!def) return { type: 'object' }
    const typeName = def.typeName as string | undefined
    if (typeName !== 'ZodObject') return { type: 'object' }
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
