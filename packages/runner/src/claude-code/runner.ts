import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { RunInput, RunResult, RunnerAdapter, StreamChunk } from '@openaios/core'

interface ClaudeCodeRunnerOptions {
  /** Path to the claude binary. Defaults to 'claude' (searched in PATH). */
  bin?: string
}

// Message types emitted by `claude --output-format stream-json --verbose`
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
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  cost_usd?: number
  session_id?: string
}

export class ClaudeCodeRunner implements RunnerAdapter {
  readonly supportsSessionResume = true
  readonly mode = 'native' as const
  private readonly bin: string

  constructor(options: ClaudeCodeRunnerOptions = {}) {
    this.bin = options.bin ?? 'claude'
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
    await this.ensureWorkspace(input.workspaceDir)

    const args = this.buildArgs(input)
    // Build clean env: strip CLAUDECODE to allow nested claude invocations,
    // and disable interactive prompts.
    const env: Record<string, string | undefined> = { ...process.env, CLAUDE_CODE_INTERACTIVE: '0' }
    delete env['CLAUDECODE']

    const proc = spawn(this.bin, args, {
      cwd: input.workspaceDir,
      env,
      // Do NOT use shell — prevents injection via user message
      shell: false,
      // stdin must be 'ignore' (maps to /dev/null) — if left as the default
      // pipe, claude blocks waiting for stdin input before making API calls.
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let textBuffer = ''
    let lastClaudeSessionId = input.claudeSessionId ?? ''
    let costUsd: number | undefined
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    let finalOutput = ''
    let stderrOutput = ''

    proc.stderr.setEncoding('utf-8')
    proc.stderr.on('data', (chunk: string) => {
      stderrOutput += chunk
    })

    // Collect stdout as lines, parse JSONL
    proc.stdout.setEncoding('utf-8')

    const parseStream = async function* (): AsyncGenerator<StreamChunk, void> {
      let partial = ''
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

    if (exitCode !== 0 && exitCode !== null) {
      throw new Error(
        `claude exited with code ${exitCode}. stderr: ${stderrOutput.slice(0, 500)}`
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
    return new Promise((resolve) => {
      const proc = spawn(this.bin, ['--version'], { shell: false })
      proc.on('close', (code) => resolve(code === 0))
      proc.on('error', () => resolve(false))
    })
  }

  private buildArgs(input: RunInput): string[] {
    return buildClaudeArgs(input)
  }

  private async ensureWorkspace(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
  }
}

/**
 * Build the CLI arguments for a claude invocation.
 * Exported so DockerRunner can reuse identical arg-building logic.
 */
export function buildClaudeArgs(input: RunInput): string[] {
  const args: string[] = [
    '--output-format', 'stream-json',
    '--verbose',
  ]

  if (input.model && input.model !== 'claude-code') {
    args.push('--model', input.model)
  }

  // Only resume if the session ID looks like a real Claude session ID (UUID-like).
  // Prevents passing invalid IDs from other runners (e.g. Ollama stores the session key).
  if (input.claudeSessionId && /^[0-9a-f-]{20,}$/i.test(input.claudeSessionId)) {
    args.push('--resume', input.claudeSessionId)
  }

  if (input.systemPrompt) {
    args.push('--system-prompt', input.systemPrompt)
  }

  // Build allowedTools list — deny-by-default
  if (input.allowedTools.length > 0) {
    args.push('--allowedTools', input.allowedTools.join(','))
  }

  if (input.deniedTools.length > 0) {
    args.push('--disallowedTools', input.deniedTools.join(','))
  }

  // SECURITY: `--` end-of-flags separator before user message.
  // This prevents any user-supplied content from being interpreted as CLI flags.
  args.push('--')
  args.push(input.message)

  return args
}

function safeParseJson(line: string): unknown | null {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}
