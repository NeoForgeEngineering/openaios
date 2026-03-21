import type {
  MemoryAdapter,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from '@openaios/core'
import { z } from 'zod'

const InputSchema = z.object({
  query: z.string().min(1),
  agent_name: z.string().optional(),
  top_k: z.number().int().min(1).max(20).optional(),
})

export function createMemorySearchTool(
  memoryStore: MemoryAdapter,
): ToolDefinition {
  return {
    name: 'memory_search',
    description:
      'Search semantic memory for relevant entries. Returns scored results ordered by relevance.',
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
        const results = await memoryStore.search(agentName, parsed.data.query, {
          ...(parsed.data.top_k !== undefined && { topK: parsed.data.top_k }),
        })
        return { type: 'json', content: { results } }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { type: 'error', content: `Memory search failed: ${message}` }
      }
    },
  }
}
