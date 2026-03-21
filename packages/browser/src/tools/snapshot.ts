import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'
import type { AgentBrowserClient } from '../agent-browser-client.js'

const InputSchema = z.object({})

export function createSnapshotTool(client: AgentBrowserClient): ToolDefinition {
  return {
    name: 'browser_snapshot',
    description:
      'Get the current page accessibility snapshot (DOM structure as text).',
    inputSchema: InputSchema,
    async execute(_input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const result = await client.execute({
        action: 'snapshot',
        params: {},
      })

      if (!result.success) {
        return { type: 'error', content: result.error ?? 'Snapshot failed' }
      }

      return { type: 'text', content: result.data ?? '' }
    },
  }
}
