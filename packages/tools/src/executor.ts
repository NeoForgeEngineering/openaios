import type { GovernanceAdapter, ToolContext, ToolResult } from '@openaios/core'
import type { ToolRegistry } from './registry.js'

export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private governance: GovernanceAdapter,
  ) {}

  async execute(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.registry.get(name)
    if (!tool) {
      return { type: 'error', content: `Tool not found: ${name}` }
    }

    const policyInput =
      typeof input === 'object' && input !== null
        ? (input as Record<string, unknown>)
        : { _raw: input }

    const decision = await this.governance.checkPolicy({
      agentName: ctx.agentName,
      sessionKey: ctx.sessionKey,
      tool: name,
      input: policyInput,
    })

    if (!decision.allowed) {
      this.governance.reportToolUse({
        agentName: ctx.agentName,
        sessionKey: ctx.sessionKey,
        tool: name,
        input: policyInput,
        decision,
        timestampMs: Date.now(),
      })
      return { type: 'error', content: `Denied: ${decision.reason}` }
    }

    let result: ToolResult
    try {
      result = await tool.execute(input, ctx)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result = {
        type: 'error',
        content: `Tool execution failed: ${message}`,
      }
    }

    this.governance.reportToolUse({
      agentName: ctx.agentName,
      sessionKey: ctx.sessionKey,
      tool: name,
      input: policyInput,
      decision,
      timestampMs: Date.now(),
    })

    return result
  }
}
