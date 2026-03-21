import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ToolContext, ToolDefinition } from '@openaios/core'
import { MockGovernance } from '@openaios/core/testing'
import { z } from 'zod'
import { ToolExecutor } from '../executor.js'
import { ToolRegistry } from '../registry.js'

const ctx: ToolContext = {
  sessionKey: 'test-session',
  agentName: 'test-agent',
  workspaceDir: '/tmp/workspace',
}

function makeTool(
  name: string,
  fn?: (
    input: unknown,
    ctx: ToolContext,
  ) => Promise<import('@openaios/core').ToolResult>,
): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: z.object({}),
    execute: fn ?? (async () => ({ type: 'text' as const, content: 'ok' })),
  }
}

describe('ToolExecutor', () => {
  it('executes tool when governance allows', async () => {
    const registry = new ToolRegistry()
    const governance = new MockGovernance()
    governance.decision = { allowed: true }

    let called = false
    registry.add(
      makeTool('my_tool', async () => {
        called = true
        return { type: 'text', content: 'result' }
      }),
    )

    const executor = new ToolExecutor(registry, governance)
    const result = await executor.execute('my_tool', {}, ctx)

    assert.equal(called, true)
    assert.equal(result.type, 'text')
    assert.equal(result.content, 'result')
    assert.equal(governance.toolUseEvents.length, 1)
    assert.equal(governance.toolUseEvents[0]?.tool, 'my_tool')
  })

  it('returns error when governance denies', async () => {
    const registry = new ToolRegistry()
    const governance = new MockGovernance()
    governance.decision = { allowed: false, reason: 'not permitted' }

    let called = false
    registry.add(
      makeTool('blocked_tool', async () => {
        called = true
        return { type: 'text', content: 'should not run' }
      }),
    )

    const executor = new ToolExecutor(registry, governance)
    const result = await executor.execute('blocked_tool', {}, ctx)

    assert.equal(called, false)
    assert.equal(result.type, 'error')
    assert.equal(result.content, 'Denied: not permitted')
    assert.equal(governance.toolUseEvents.length, 1)
  })

  it('returns error for non-existent tool', async () => {
    const registry = new ToolRegistry()
    const governance = new MockGovernance()

    const executor = new ToolExecutor(registry, governance)
    const result = await executor.execute('nonexistent', {}, ctx)

    assert.equal(result.type, 'error')
    assert.equal(result.content, 'Tool not found: nonexistent')
    // Governance should NOT be consulted for non-existent tools
    assert.equal(governance.toolUseEvents.length, 0)
  })

  it('catches tool execution errors', async () => {
    const registry = new ToolRegistry()
    const governance = new MockGovernance()
    governance.decision = { allowed: true }

    registry.add(
      makeTool('bad_tool', async () => {
        throw new Error('something broke')
      }),
    )

    const executor = new ToolExecutor(registry, governance)
    const result = await executor.execute('bad_tool', {}, ctx)

    assert.equal(result.type, 'error')
    assert.match(
      result.content as string,
      /Tool execution failed: something broke/,
    )
    // Audit should still be reported
    assert.equal(governance.toolUseEvents.length, 1)
  })

  it('catches non-Error throws', async () => {
    const registry = new ToolRegistry()
    const governance = new MockGovernance()
    governance.decision = { allowed: true }

    registry.add(
      makeTool('string_throw', async () => {
        throw 'string error'
      }),
    )

    const executor = new ToolExecutor(registry, governance)
    const result = await executor.execute('string_throw', {}, ctx)

    assert.equal(result.type, 'error')
    assert.match(result.content as string, /string error/)
  })
})
