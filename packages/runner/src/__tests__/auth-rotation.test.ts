import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuthRotation } from '../auth-rotation.js'

describe('AuthRotation', () => {
  it('round-robins through profiles', () => {
    const rot = new AuthRotation([
      { key: 'key-a' },
      { key: 'key-b' },
      { key: 'key-c' },
    ])

    assert.equal(rot.next().key, 'key-a')
    assert.equal(rot.next().key, 'key-b')
    assert.equal(rot.next().key, 'key-c')
    assert.equal(rot.next().key, 'key-a') // wraps around
  })

  it('skips rate-limited keys', () => {
    const rot = new AuthRotation([{ key: 'key-a' }, { key: 'key-b' }], {
      cooldownMs: 60_000,
    })

    rot.next() // key-a
    rot.markRateLimited('key-a')

    // Next call should skip key-a (on cooldown) and return key-b
    assert.equal(rot.next().key, 'key-b')
    assert.equal(rot.next().key, 'key-b') // key-a still on cooldown
  })

  it('returns least-recently-limited when all on cooldown', () => {
    const rot = new AuthRotation([{ key: 'key-a' }, { key: 'key-b' }], {
      cooldownMs: 60_000,
    })

    rot.markRateLimited('key-a')
    rot.markRateLimited('key-b')

    // Should still return one (the least-recently limited)
    const result = rot.next()
    assert.ok(result.key === 'key-a' || result.key === 'key-b')
  })

  it('availableCount reflects cooldowns', () => {
    const rot = new AuthRotation([{ key: 'key-a' }, { key: 'key-b' }])

    assert.equal(rot.availableCount(), 2)

    rot.markRateLimited('key-a')
    assert.equal(rot.availableCount(), 1)
  })

  it('totalCount returns all profiles', () => {
    const rot = new AuthRotation([{ key: 'a' }, { key: 'b' }, { key: 'c' }])
    assert.equal(rot.totalCount, 3)
  })

  it('throws on empty profiles', () => {
    assert.throws(() => new AuthRotation([]), /at least one profile/)
  })
})
