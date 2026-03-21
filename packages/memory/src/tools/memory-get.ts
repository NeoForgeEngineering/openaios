import type {
  MemoryAdapter,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from '@openaios/core'
import { z } from 'zod'

const InputSchema = z.object({
  key: z.string().min(1),
  agent_name: z.string().optional(),
})

export function createMemoryGetTool(
  memoryStore: MemoryAdapter,
): ToolDefinition {
  return {
    name: 'memory_get',
    description: 'Retrieve a specific memory entry by key.',
    inputSchema: InputSchema,
    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      const agentName = parsed.data.agent_name ?? ctx.agentName

      try {
        const entry = await memoryStore.get(agentName, parsed.data.key)
        if (!entry) {
          return {
            type: 'error',
            content: `Memory not found: ${parsed.data.key}`,
          }
        }
        return {
          type: 'json',
          content: entry as unknown as Record<string, unknown>,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { type: 'error', content: `Memory get failed: ${message}` }
      }
    },
  }
}
