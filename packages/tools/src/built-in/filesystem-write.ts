import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'

const InputSchema = z.object({
  file_path: z.string().min(1),
  content: z.string(),
  create_dirs: z.boolean().optional(),
})

export function createFilesystemWriteTool(): ToolDefinition {
  return {
    name: 'filesystem_write',
    description:
      'Write content to a file. Creates the file if it does not exist. ' +
      'Overwrites existing content. Set create_dirs to create parent directories.',
    inputSchema: InputSchema,
    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      const {
        file_path: filePath,
        content,
        create_dirs: createDirs,
      } = parsed.data

      try {
        if (createDirs) {
          const dir = dirname(filePath)
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true })
          }
        }

        writeFileSync(filePath, content, 'utf-8')
        return {
          type: 'text',
          content: `Written ${content.length} chars to ${filePath}`,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { type: 'error', content: `Write failed: ${message}` }
      }
    },
  }
}
