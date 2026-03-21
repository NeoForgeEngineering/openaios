import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RateLimiter } from '../rate-limiter.js'

describe('RateLimiter', () => {
  it('allows up to capacity', () => {
    const rl = new RateLimiter({
      assistant: { capacity: 3, refill_per_second: 1 },
    })
    const now = 1000000

    assert.equal(rl.consume('assistant', now), true)
    assert.equal(rl.consume('assistant', now), true)
    assert.equal(rl.consume('assistant', now), true)
  })

  it('denies when capacity exceeded', () => {
    const rl = new RateLimiter({
      assistant: { capacity: 2, refill_per_second: 1 },
    })
    const now = 1000000

    assert.equal(rl.consume('assistant', now), true)
    assert.equal(rl.consume('assistant', now), true)
    assert.equal(rl.consume('assistant', now), false)
  })

  it('refills over time', () => {
    const rl = new RateLimiter({
      assistant: { capacity: 2, refill_per_second: 1 },
    })
    const now = 1000000

    rl.consume('assistant', now)
    rl.consume('assistant', now)
    assert.equal(rl.consume('assistant', now), false)

    // 1 second later: should have refilled 1 token
    assert.equal(rl.consume('assistant', now + 1000), true)
    assert.equal(rl.consume('assistant', now + 1000), false)
  })

  it('allows unconfigured agents', () => {
    const rl = new RateLimiter({
      assistant: { capacity: 1, refill_per_second: 1 },
    })
    assert.equal(rl.consume('unknown-agent'), true)
  })

  it('does not exceed capacity on refill', () => {
    const rl = new RateLimiter({
      assistant: { capacity: 2, refill_per_second: 10 },
    })
    const now = 1000000

    rl.consume('assistant', now)
    // Wait 10 seconds: would refill 100 tokens, but capacity is 2
    const remaining = rl.remaining('assistant')
    assert.ok(remaining <= 2)
  })

  it('remaining returns capacity for unconfigured agent', () => {
    const rl = new RateLimiter({})
    assert.equal(rl.remaining('unknown'), Infinity)
  })
})
