import { readFileSync, writeFileSync } from 'node:fs'
import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'

const InputSchema = z.object({
  file_path: z.string().min(1),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
})

export function createFilesystemEditTool(): ToolDefinition {
  return {
    name: 'filesystem_edit',
    description:
      'Edit a file by replacing a specific string. The old_string must be unique ' +
      'in the file (unless replace_all is true). This is safer than full file writes ' +
      'for targeted changes.',
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
        old_string: oldStr,
        new_string: newStr,
        replace_all: replaceAll,
      } = parsed.data

      try {
        const content = readFileSync(filePath, 'utf-8')

        if (!content.includes(oldStr)) {
          return { type: 'error', content: 'old_string not found in file' }
        }

        if (!replaceAll) {
          const firstIdx = content.indexOf(oldStr)
          const lastIdx = content.lastIndexOf(oldStr)
          if (firstIdx !== lastIdx) {
            return {
              type: 'error',
              content:
                'old_string is not unique in file — use replace_all: true or provide more context',
            }
          }
        }

        const updated = replaceAll
          ? content.replaceAll(oldStr, newStr)
          : content.replace(oldStr, newStr)

        writeFileSync(filePath, updated, 'utf-8')
        return { type: 'text', content: `Edited ${filePath}` }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { type: 'error', content: `Edit failed: ${message}` }
      }
    },
  }
}
