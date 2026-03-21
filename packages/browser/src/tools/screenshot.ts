import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'
import type { AgentBrowserClient } from '../agent-browser-client.js'

const InputSchema = z.object({})

export function createScreenshotTool(
  client: AgentBrowserClient,
): ToolDefinition {
  return {
    name: 'browser_screenshot',
    description:
      'Take a screenshot of the current page. Returns base64-encoded PNG.',
    inputSchema: InputSchema,
    async execute(_input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const result = await client.execute({
        action: 'screenshot',
        params: {},
      })

      if (!result.success) {
        return { type: 'error', content: result.error ?? 'Screenshot failed' }
      }

      return { type: 'image', content: result.data ?? '' }
    },
  }
}
