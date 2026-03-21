import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ToolContext } from '@openaios/core'
import { createWebFetchTool } from '../built-in/web-fetch.js'

const ctx: ToolContext = {
  sessionKey: 'test-session',
  agentName: 'test-agent',
  workspaceDir: '/tmp/workspace',
}

describe('web-fetch tool', () => {
  it('has correct name and description', () => {
    const tool = createWebFetchTool()
    assert.equal(tool.name, 'web_fetch')
    assert.ok(tool.description.length > 0)
  })

  it('rejects invalid input', async () => {
    const tool = createWebFetchTool()
    const result = await tool.execute({ url: 'not-a-url' }, ctx)
    assert.equal(result.type, 'error')
  })

  it('denies URL matching denylist', async () => {
    const tool = createWebFetchTool({
      urlDenylist: ['https://evil.com/*'],
    })
    const result = await tool.execute({ url: 'https://evil.com/page' }, ctx)
    assert.equal(result.type, 'error')
    assert.equal(result.content, 'URL denied by policy')
  })

  it('denies URL not in allowlist when allowlist is set', async () => {
    const tool = createWebFetchTool({
      urlAllowlist: ['https://example.com/*'],
    })
    const result = await tool.execute({ url: 'https://other.com/page' }, ctx)
    assert.equal(result.type, 'error')
    assert.equal(result.content, 'URL not in allowlist')
  })

  it('allows URL matching allowlist', async () => {
    const tool = createWebFetchTool({
      urlAllowlist: ['https://example.com/*'],
    })
    // This will fail due to network, but it should pass the allowlist check
    const result = await tool.execute({ url: 'https://example.com/page' }, ctx)
    // It either succeeds or fails with a fetch error (not an allowlist error)
    if (result.type === 'error') {
      assert.ok(!(result.content as string).includes('not in allowlist'))
    }
  })

  it('denylist takes precedence over allowlist', async () => {
    const tool = createWebFetchTool({
      urlAllowlist: ['https://evil.com/*'],
      urlDenylist: ['https://evil.com/*'],
    })
    const result = await tool.execute({ url: 'https://evil.com/page' }, ctx)
    assert.equal(result.type, 'error')
    assert.equal(result.content, 'URL denied by policy')
  })
})
