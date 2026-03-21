import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'
import type { AgentBrowserClient } from '../agent-browser-client.js'
import type { BrowserGovernance } from '../governance.js'

const InputSchema = z.object({
  url: z.string().url(),
})

export function createNavigateTool(
  client: AgentBrowserClient,
  governance: BrowserGovernance,
): ToolDefinition {
  return {
    name: 'browser_navigate',
    description: 'Navigate the browser to a URL.',
    inputSchema: InputSchema,
    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      const check = governance.check(parsed.data.url)
      if (!check.allowed) {
        return { type: 'error', content: check.reason ?? 'URL denied' }
      }

      const result = await client.execute({
        action: 'navigate',
        params: { url: parsed.data.url },
      })

      if (!result.success) {
        return { type: 'error', content: result.error ?? 'Navigation failed' }
      }

      return {
        type: 'text',
        content: result.data ?? `Navigated to ${parsed.data.url}`,
      }
    },
  }
}
