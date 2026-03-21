import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ToolDefinition } from '@openaios/core'
import { z } from 'zod'
import { ToolRegistry } from '../registry.js'

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: z.object({}),
    async execute() {
      return { type: 'text' as const, content: 'ok' }
    },
  }
}

describe('ToolRegistry', () => {
  it('add and get a tool', () => {
    const registry = new ToolRegistry()
    const tool = makeTool('web_fetch')
    registry.add(tool)

    assert.equal(registry.has('web_fetch'), true)
    assert.equal(registry.get('web_fetch'), tool)
  })

  it('list returns all tools', () => {
    const registry = new ToolRegistry()
    registry.add(makeTool('tool_a'))
    registry.add(makeTool('tool_b'))

    const list = registry.list()
    assert.equal(list.length, 2)
    assert.equal(list[0]?.name, 'tool_a')
    assert.equal(list[1]?.name, 'tool_b')
  })

  it('throws on duplicate registration', () => {
    const registry = new ToolRegistry()
    registry.add(makeTool('dup'))

    assert.throws(() => registry.add(makeTool('dup')), /already registered/)
  })

  it('remove returns true for existing tool', () => {
    const registry = new ToolRegistry()
    registry.add(makeTool('removable'))

    assert.equal(registry.remove('removable'), true)
    assert.equal(registry.has('removable'), false)
  })

  it('remove returns false for non-existent tool', () => {
    const registry = new ToolRegistry()
    assert.equal(registry.remove('nonexistent'), false)
  })

  it('get returns undefined for non-existent tool', () => {
    const registry = new ToolRegistry()
    assert.equal(registry.get('nonexistent'), undefined)
  })

  it('empty registry returns empty list', () => {
    const registry = new ToolRegistry()
    assert.deepEqual(registry.list(), [])
  })

  it('rejects invalid tool names', () => {
    const registry = new ToolRegistry()

    assert.throws(
      () => registry.add(makeTool('Has Spaces')),
      /Invalid tool name/,
    )
    assert.throws(() => registry.add(makeTool('')), /Invalid tool name/)
  })

  it('list returns a snapshot copy', () => {
    const registry = new ToolRegistry()
    registry.add(makeTool('tool_a'))

    const list1 = registry.list()
    registry.add(makeTool('tool_b'))
    const list2 = registry.list()

    assert.equal(list1.length, 1)
    assert.equal(list2.length, 2)
  })
})
