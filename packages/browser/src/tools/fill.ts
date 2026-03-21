import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'
import type { AgentBrowserClient } from '../agent-browser-client.js'

const InputSchema = z.object({
  selector: z.string().min(1),
  value: z.string(),
})

export function createFillTool(client: AgentBrowserClient): ToolDefinition {
  return {
    name: 'browser_fill',
    description: 'Fill a form field on the current page.',
    inputSchema: InputSchema,
    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      const result = await client.execute({
        action: 'fill',
        params: { selector: parsed.data.selector, value: parsed.data.value },
      })

      if (!result.success) {
        return { type: 'error', content: result.error ?? 'Fill failed' }
      }

      return {
        type: 'text',
        content: result.data ?? `Filled ${parsed.data.selector}`,
      }
    },
  }
}
