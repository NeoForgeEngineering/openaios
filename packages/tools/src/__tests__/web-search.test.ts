import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createWebSearchTool } from '../built-in/web-search.js'

describe('web-search tool', () => {
  it('has correct name and description', () => {
    const tool = createWebSearchTool({ provider: 'brave', apiKey: 'test' })
    assert.equal(tool.name, 'web_search')
    assert.ok(tool.description.length > 0)
  })

  it('rejects empty query', async () => {
    const tool = createWebSearchTool({ provider: 'brave', apiKey: 'test' })
    const result = await tool.execute(
      { query: '' },
      { sessionKey: 's', agentName: 'a', workspaceDir: '/tmp' },
    )
    assert.equal(result.type, 'error')
  })

  it('rejects missing query', async () => {
    const tool = createWebSearchTool({ provider: 'brave', apiKey: 'test' })
    const result = await tool.execute(
      {},
      { sessionKey: 's', agentName: 'a', workspaceDir: '/tmp' },
    )
    assert.equal(result.type, 'error')
  })
})
