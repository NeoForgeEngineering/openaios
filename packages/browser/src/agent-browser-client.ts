import { spawn } from 'node:child_process'
import { logger } from '@openaios/core'

export interface BrowserAction {
  action: 'navigate' | 'snapshot' | 'click' | 'fill' | 'screenshot'
  params: Record<string, unknown>
}

export interface BrowserResult {
  success: boolean
  data?: string
  error?: string
}

/**
 * Wrapper around the agent-browser CLI.
 * Each action spawns a subprocess with JSON input/output.
 */
export class AgentBrowserClient {
  private bin: string
  private timeoutMs: number

  constructor(opts?: { bin?: string; timeoutMs?: number }) {
    this.bin = opts?.bin ?? 'agent-browser'
    this.timeoutMs = opts?.timeoutMs ?? 30_000
  }

  async execute(action: BrowserAction): Promise<BrowserResult> {
    const input = JSON.stringify({
      action: action.action,
      ...action.params,
    })

    try {
      const result = await this.spawn(['--json'], input)
      const parsed = JSON.parse(result) as {
        success?: boolean
        data?: string
        error?: string
      }
      return {
        success: parsed.success ?? true,
        ...(parsed.data !== undefined && { data: parsed.data }),
        ...(parsed.error !== undefined && { error: parsed.error }),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[browser]', `agent-browser failed: ${message}`)
      return { success: false, error: message }
    }
  }

  /** Check if agent-browser binary is available. */
  async isAvailable(): Promise<boolean> {
    try {
      await this.spawn(['--version'], '')
      return true
    } catch {
      return false
    }
  }

  private spawn(args: string[], stdin: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeoutMs,
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(stderr || `agent-browser exited with code ${code}`))
        }
      })

      child.on('error', reject)

      if (stdin) {
        child.stdin.write(stdin)
      }
      child.stdin.end()
    })
  }
}
