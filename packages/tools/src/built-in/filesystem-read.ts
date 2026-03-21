import { readdirSync, readFileSync, statSync } from 'node:fs'
import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'

const InputSchema = z.object({
  path: z.string().min(1),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).optional(),
})

export function createFilesystemReadTool(): ToolDefinition {
  return {
    name: 'filesystem_read',
    description:
      'Read a file or list a directory. For files, returns content with line numbers. ' +
      'Use offset/limit for large files. For directories, returns the listing.',
    inputSchema: InputSchema,
    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      const { path: filePath, offset, limit } = parsed.data

      try {
        const stat = statSync(filePath)

        if (stat.isDirectory()) {
          const entries = readdirSync(filePath, { withFileTypes: true })
          const listing = entries
            .map((e) => `${e.isDirectory() ? 'd' : '-'} ${e.name}`)
            .join('\n')
          return { type: 'text', content: listing }
        }

        const content = readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')
        const start = offset ?? 0
        const end = limit ? start + limit : lines.length
        const slice = lines.slice(start, end)

        const numbered = slice
          .map((line, i) => `${String(start + i + 1).padStart(6)} ${line}`)
          .join('\n')

        return { type: 'text', content: numbered }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { type: 'error', content: `Read failed: ${message}` }
      }
    },
  }
}
