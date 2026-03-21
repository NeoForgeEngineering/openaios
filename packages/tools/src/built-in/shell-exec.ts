import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'

const execAsync = promisify(execFile)

const InputSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().positive().optional(),
})

export function createShellExecTool(): ToolDefinition {
  return {
    name: 'shell_exec',
    description:
      'Execute a shell command. The command is run via execFile (not a shell) for safety — ' +
      'pass the binary and args separately. Use cwd to set working directory. ' +
      'Default timeout is 30 seconds.',
    inputSchema: InputSchema,
    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      const { command, args, cwd, timeout_ms: timeoutMs } = parsed.data

      try {
        const { stdout, stderr } = await execAsync(command, args ?? [], {
          cwd: cwd ?? ctx.workspaceDir,
          timeout: timeoutMs ?? 30_000,
          maxBuffer: 1024 * 1024, // 1MB
          encoding: 'utf-8',
        })

        const output = [
          ...(stdout ? [`stdout:\n${stdout}`] : []),
          ...(stderr ? [`stderr:\n${stderr}`] : []),
        ].join('\n')

        return { type: 'text', content: output || '(no output)' }
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message?: string }
        const output = [
          ...(e.stdout ? [`stdout:\n${e.stdout}`] : []),
          ...(e.stderr ? [`stderr:\n${e.stderr}`] : []),
          `error: ${e.message ?? String(err)}`,
        ].join('\n')
        return { type: 'error', content: output }
      }
    },
  }
}
