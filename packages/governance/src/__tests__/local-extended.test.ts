import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LocalGovernance } from '../local.js'
import { PathPolicy } from '../path-policy.js'
import { RateLimiter } from '../rate-limiter.js'

describe('LocalGovernance with extensions', () => {
  it('denies when rate limit exceeded', async () => {
    const rl = new RateLimiter({
      assistant: { capacity: 1, refill_per_second: 0 },
    })
    const gov = new LocalGovernance({
      agentPermissions: { assistant: { allow: ['*'], deny: [] } },
      rateLimiter: rl,
    })

    // First call succeeds
    const d1 = await gov.checkPolicy({
      agentName: 'assistant',
      sessionKey: 's',
      tool: 'web_fetch',
      input: {},
    })
    assert.equal(d1.allowed, true)

    // Second call rate-limited
    const d2 = await gov.checkPolicy({
      agentName: 'assistant',
      sessionKey: 's',
      tool: 'web_fetch',
      input: {},
    })
    assert.equal(d2.allowed, false)
    assert.ok('reason' in d2 && d2.reason.includes('Rate limit'))
  })

  it('denies path access via path policy', async () => {
    const pp = new PathPolicy({
      assistant: { deny: ['/workspace/.env'] },
    })
    const gov = new LocalGovernance({
      agentPermissions: { assistant: { allow: ['*'], deny: [] } },
      pathPolicy: pp,
    })

    const d1 = await gov.checkPolicy({
      agentName: 'assistant',
      sessionKey: 's',
      tool: 'Read',
      input: { file_path: '/workspace/.env' },
    })
    assert.equal(d1.allowed, false)

    const d2 = await gov.checkPolicy({
      agentName: 'assistant',
      sessionKey: 's',
      tool: 'Read',
      input: { file_path: '/workspace/ok.ts' },
    })
    assert.equal(d2.allowed, true)
  })

  it('backward compat: plain Record constructor', async () => {
    const gov = new LocalGovernance({ assistant: { allow: ['*'], deny: [] } })
    const d = await gov.checkPolicy({
      agentName: 'assistant',
      sessionKey: 's',
      tool: 'web_fetch',
      input: {},
    })
    assert.equal(d.allowed, true)
  })
})
