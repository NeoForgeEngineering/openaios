import { spawn } from 'node:child_process'
import type { RunInput, RunResult, RunnerAdapter, StreamChunk } from '@openaios/core'
import { buildClaudeArgs } from '../claude-code/runner.js'
import type { ContainerOrchestrator, DockerContainerConfig } from './orchestrator.js'

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
  agentName: string
  /** Docker container config (image, memory, cpus) */
  containerConfig?: DockerContainerConfig
  /** Path to the claude binary inside the container. Defaults to 'claude'. */
  bin?: string
}

/**
 * RunnerAdapter that executes each turn via `docker exec` into a long-lived container.
 */
export class DockerRunner implements RunnerAdapter {
  readonly supportsSessionResume = true
  readonly mode = 'docker' as const

  private readonly orchestrator: ContainerOrchestrator
  private readonly agentName: string
  private readonly containerConfig: DockerContainerConfig
  private readonly bin: string

  constructor(opts: DockerRunnerOptions) {
    this.orchestrator = opts.orchestrator
    this.agentName = opts.agentName
    this.containerConfig = opts.containerConfig ?? {}
    this.bin = opts.bin ?? 'claude'
  }

  async run(input: RunInput): Promise<RunResult> {
    const chunks: StreamChunk[] = []
    let result: RunResult | undefined

    const gen = this.runStreaming(input)
    let next = await gen.next()
    while (!next.done) {
      chunks.push(next.value)
      next = await gen.next()
    }
    result = next.value
    return result
  }

  async *runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult> {
    await this.orchestrator.ensureRunning(this.agentName, this.containerConfig)

    const claudeArgs = buildClaudeArgs(input)
    // Execute: docker exec <container> claude <args...>
    const dockerArgs = ['exec', `openaios-${this.agentName}`, this.bin, ...claudeArgs]

    const proc = spawn('docker', dockerArgs, {
      shell: false,
      env: {
        ...process.env,
        CLAUDE_CODE_INTERACTIVE: '0',
      },
    })

    let textBuffer = ''
    let lastClaudeSessionId = input.claudeSessionId ?? ''
    let costUsd: number | undefined
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    let finalOutput = ''
    let stderrOutput = ''

    proc.stderr.setEncoding('utf-8')
    proc.stderr.on('data', (chunk: string) => { stderrOutput += chunk })

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
        `docker exec claude exited with code ${String(exitCode)}. stderr: ${stderrOutput.slice(0, 500)}`
      )
    }

    if (!lastClaudeSessionId) {
      throw new Error('claude did not emit a session_id — cannot resume this session')
    }

    return {
      claudeSessionId: lastClaudeSessionId,
      output: finalOutput || textBuffer,
      ...(costUsd !== undefined && { costUsd }),
      ...(inputTokens !== undefined && { inputTokens }),
      ...(outputTokens !== undefined && { outputTokens }),
      model: input.model,
    }
  }

  async healthCheck(): Promise<boolean> {
    const running = await this.orchestrator.isRunning(this.agentName)
    if (!running) return false

    const result = await this.orchestrator.exec(this.agentName, ['which', this.bin])
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
