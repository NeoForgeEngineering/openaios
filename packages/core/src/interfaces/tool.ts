import type { z } from 'zod'

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodType
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>
}

export interface ToolContext {
  sessionKey: string
  agentName: string
  workspaceDir: string
}

export interface ToolResult {
  type: 'text' | 'json' | 'image' | 'error'
  content: string | Record<string, unknown>
}
