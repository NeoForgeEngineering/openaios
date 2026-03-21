import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'
import type { AgentBrowserClient } from '../agent-browser-client.js'

const InputSchema = z.object({
  selector: z.string().min(1),
})

export function createClickTool(client: AgentBrowserClient): ToolDefinition {
  return {
    name: 'browser_click',
    description:
      'Click an element on the current page by CSS selector or accessibility ref.',
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
        action: 'click',
        params: { selector: parsed.data.selector },
      })

      if (!result.success) {
        return { type: 'error', content: result.error ?? 'Click failed' }
      }

      return {
        type: 'text',
        content: result.data ?? `Clicked ${parsed.data.selector}`,
      }
    },
  }
}
