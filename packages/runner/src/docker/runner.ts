import { spawn } from 'node:child_process'
import type {
  AgentConfig,
  RunInput,
  RunnerAdapter,
  RunResult,
  StreamChunk,
} from '@openaios/core'
import { buildClaudeArgs } from '../claude-code/runner.js'
import type {
  ContainerOrchestrator,
  DockerContainerConfig,
} from './orchestrator.js'

// Mirrors the shape emitted by `claude --output-format stream-json --verbose`
interface ClaudeStreamMessage {
  type: 'system' | 'assistant' | 'result' | 'user'
  subtype?: string
  message?: {
    content?: Array<{ type: string; text?: string }>
  }
  result?: string
  usage?: {
    input_tokens: number
    output_tokens: number
  }
  cost_usd?: number
  session_id?: string
}

export interface DockerRunnerOptions {
  orchestrator: ContainerOrchestrator
  /** Docker container config (image, memory, cpus) */
  containerConfig?: DockerContainerConfig
  /** Path to the claude binary inside the container. Defaults to 'claude'. */
  bin?: string
}

/**
 * RunnerAdapter that executes each turn via `docker exec` into a long-lived container.
 * The runner owns session continuity — maps sessionKey → claudeSessionId internally.
 */
export class DockerRunner implements RunnerAdapter {
  readonly supportsSessionResume = true
  readonly env = 'docker' as const

  private config: AgentConfig
  private readonly orchestrator: ContainerOrchestrator
  private readonly containerConfig: DockerContainerConfig
  private readonly bin: string
  /** sessionKey → claude Code session ID for --resume */
  private readonly sessions = new Map<string, string>()

  constructor(config: AgentConfig, opts: DockerRunnerOptions) {
    this.config = config
    this.orchestrator = opts.orchestrator
    this.containerConfig = opts.containerConfig ?? {}
    this.bin = opts.bin ?? 'claude'
  }

  async run(input: RunInput): Promise<RunResult> {
    const chunks: StreamChunk[] = []

    const gen = this.runStreaming(input)
    let next = await gen.next()
    while (!next.done) {
      chunks.push(next.value)
      next = await gen.next()
    }
    const result = next.value
    return result
  }

  async *runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult> {
    await this.orchestrator.ensureRunning(
      this.config.agentName,
      this.containerConfig,
    )

    const resumeId = this.sessions.get(input.sessionKey)
    const model = input.modelOverride ?? this.config.defaultModel
    const claudeArgs = buildClaudeArgs({
      config: this.config,
      message: input.message,
      model,
      ...(resumeId !== undefined && { resumeId }),
    })

    // Execute: docker exec <container> claude <args...>
    const dockerArgs = [
      'exec',
      `openaios-${this.config.agentName}`,
      this.bin,
      ...claudeArgs,
    ]

    const proc = spawn('docker', dockerArgs, {
      shell: false,
      env: {
        ...process.env,
        CLAUDE_CODE_INTERACTIVE: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let textBuffer = ''
    let lastClaudeSessionId = resumeId ?? ''
    let costUsd: number | undefined
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    let finalOutput = ''
    let stderrOutput = ''

    proc.stderr.setEncoding('utf-8')
    proc.stderr.on('data', (chunk: string) => {
      stderrOutput += chunk
    })

    const parseStream = async function* (): AsyncGenerator<StreamChunk, void> {
      let partial = ''
      proc.stdout.setEncoding('utf-8')
      for await (const chunk of proc.stdout) {
        partial += chunk as string
        const lines = partial.split('\n')
        partial = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const parsed = safeParseJson(trimmed)
          if (!parsed) continue

          const msg = parsed as ClaudeStreamMessage

          if (msg.session_id) {
            lastClaudeSessionId = msg.session_id
          }

          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text) {
                textBuffer += block.text
                yield { type: 'text', text: block.text }
              }
            }
          }

          if (msg.type === 'result') {
            if (msg.cost_usd !== undefined) costUsd = msg.cost_usd
            if (msg.usage) {
              inputTokens = msg.usage.input_tokens
              outputTokens = msg.usage.output_tokens
            }
            if (msg.result) {
              finalOutput = msg.result
            }
            if (msg.session_id) {
              lastClaudeSessionId = msg.session_id
            }
          }
        }
      }
    }

    yield* parseStream()

    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on('close', resolve)
    })

    if (exitCode !== 0) {
      throw new Error(
        `docker exec claude exited with code ${String(exitCode)}. stderr: ${stderrOutput.slice(0, 500)}`,
      )
    }

    if (!lastClaudeSessionId) {
      throw new Error(
        'claude did not emit a session_id — cannot resume this session',
      )
    }

    // Store session ID for next turn
    this.sessions.set(input.sessionKey, lastClaudeSessionId)

    return {
      output: finalOutput || textBuffer,
      ...(costUsd !== undefined && { costUsd }),
      ...(inputTokens !== undefined && { inputTokens }),
      ...(outputTokens !== undefined && { outputTokens }),
      model,
    }
  }

  reconfigure(config: AgentConfig): void {
    this.config = config
  }

  async healthCheck(): Promise<boolean> {
    const running = await this.orchestrator.isRunning(this.config.agentName)
    if (!running) return false

    const result = await this.orchestrator.exec(this.config.agentName, [
      'which',
      this.bin,
    ])
    return result.exitCode === 0
  }
}

function safeParseJson(line: string): unknown | null {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}
