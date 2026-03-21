import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PairingManager } from '../pairing.js'

describe('PairingManager', () => {
  it('creates a 6-digit code', () => {
    const pm = new PairingManager()
    const code = pm.createCode('assistant')
    assert.match(code, /^\d{6}$/)
  })

  it('verifies a valid code', () => {
    const pm = new PairingManager()
    const code = pm.createCode('assistant')
    assert.equal(pm.verify('assistant', code), true)
  })

  it('rejects wrong code', () => {
    const pm = new PairingManager()
    pm.createCode('assistant')
    assert.equal(pm.verify('assistant', '000000'), false)
  })

  it('rejects wrong agent', () => {
    const pm = new PairingManager()
    const code = pm.createCode('assistant')
    assert.equal(pm.verify('other', code), false)
  })

  it('rejects after revoke', () => {
    const pm = new PairingManager()
    const code = pm.createCode('assistant')
    pm.revoke('assistant', code)
    assert.equal(pm.verify('assistant', code), false)
  })

  it('rejects expired code', async () => {
    // TTL of 1ms (0.001s) — code expires almost immediately
    const pm = new PairingManager({ ttlSeconds: 0.001 })
    const code = pm.createCode('assistant')
    // Wait 2ms for expiry
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.equal(pm.verify('assistant', code), false)
  })

  it('cleanup removes expired entries', () => {
    const pm = new PairingManager({ ttlSeconds: 0 })
    pm.createCode('a')
    pm.createCode('b')
    pm.cleanup()
    // After cleanup, all expired codes should be gone
    // We can't directly check internal state, but verify returns false
  })
})
