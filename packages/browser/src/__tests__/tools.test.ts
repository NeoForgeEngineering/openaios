import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ToolContext } from '@openaios/core'
import type { BrowserAction, BrowserResult } from '../agent-browser-client.js'
import { BrowserGovernance } from '../governance.js'
import { createClickTool } from '../tools/click.js'
import { createFillTool } from '../tools/fill.js'
import { createNavigateTool } from '../tools/navigate.js'
import { createScreenshotTool } from '../tools/screenshot.js'
import { createSnapshotTool } from '../tools/snapshot.js'

const ctx: ToolContext = {
  sessionKey: 'test',
  agentName: 'assistant',
  workspaceDir: '/tmp',
}

// Mock client that records calls
class MockBrowserClient {
  calls: BrowserAction[] = []
  result: BrowserResult = { success: true, data: 'ok' }

  async execute(action: BrowserAction): Promise<BrowserResult> {
    this.calls.push(action)
    return this.result
  }

  async isAvailable(): Promise<boolean> {
    return true
  }
}

describe('browser tools', () => {
  it('navigate: allows valid URL', async () => {
    const client = new MockBrowserClient()
    const gov = new BrowserGovernance()
    const tool = createNavigateTool(client as never, gov)

    const result = await tool.execute({ url: 'https://example.com' }, ctx)
    assert.equal(result.type, 'text')
    assert.equal(client.calls.length, 1)
    assert.equal(client.calls[0]?.action, 'navigate')
  })

  it('navigate: denies blocked URL', async () => {
    const client = new MockBrowserClient()
    const gov = new BrowserGovernance({ urlDenylist: ['https://evil.com/*'] })
    const tool = createNavigateTool(client as never, gov)

    const result = await tool.execute({ url: 'https://evil.com/page' }, ctx)
    assert.equal(result.type, 'error')
    assert.equal(client.calls.length, 0) // Client never called
  })

  it('navigate: rejects invalid input', async () => {
    const client = new MockBrowserClient()
    const gov = new BrowserGovernance()
    const tool = createNavigateTool(client as never, gov)

    const result = await tool.execute({ url: 'not-a-url' }, ctx)
    assert.equal(result.type, 'error')
  })

  it('snapshot: returns page content', async () => {
    const client = new MockBrowserClient()
    client.result = { success: true, data: '<html>content</html>' }
    const tool = createSnapshotTool(client as never)

    const result = await tool.execute({}, ctx)
    assert.equal(result.type, 'text')
    assert.equal(result.content, '<html>content</html>')
  })

  it('click: sends selector to client', async () => {
    const client = new MockBrowserClient()
    const tool = createClickTool(client as never)

    const result = await tool.execute({ selector: '#submit' }, ctx)
    assert.equal(result.type, 'text')
    assert.equal(client.calls[0]?.params.selector, '#submit')
  })

  it('click: rejects empty selector', async () => {
    const client = new MockBrowserClient()
    const tool = createClickTool(client as never)

    const result = await tool.execute({ selector: '' }, ctx)
    assert.equal(result.type, 'error')
  })

  it('fill: sends selector and value', async () => {
    const client = new MockBrowserClient()
    const tool = createFillTool(client as never)

    const result = await tool.execute(
      { selector: '#email', value: 'test@example.com' },
      ctx,
    )
    assert.equal(result.type, 'text')
    assert.equal(client.calls[0]?.params.selector, '#email')
    assert.equal(client.calls[0]?.params.value, 'test@example.com')
  })

  it('screenshot: returns image type', async () => {
    const client = new MockBrowserClient()
    client.result = { success: true, data: 'base64data' }
    const tool = createScreenshotTool(client as never)

    const result = await tool.execute({}, ctx)
    assert.equal(result.type, 'image')
    assert.equal(result.content, 'base64data')
  })

  it('handles client errors', async () => {
    const client = new MockBrowserClient()
    client.result = { success: false, error: 'timeout' }
    const tool = createSnapshotTool(client as never)

    const result = await tool.execute({}, ctx)
    assert.equal(result.type, 'error')
    assert.ok((result.content as string).includes('timeout'))
  })
})
