import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BrowserSessionManager } from '../browser-session.js'

describe('BrowserSessionManager', () => {
  it('acquires a session', () => {
    const mgr = new BrowserSessionManager()
    const key = mgr.acquire('assistant')
    assert.equal(key, 'browser:assistant')
    assert.equal(mgr.hasSession('assistant'), true)
  })

  it('releases a session', () => {
    const mgr = new BrowserSessionManager()
    mgr.acquire('assistant')
    mgr.release('assistant')
    assert.equal(mgr.hasSession('assistant'), false)
  })

  it('reuses existing session', () => {
    const mgr = new BrowserSessionManager()
    const key1 = mgr.acquire('assistant')
    const key2 = mgr.acquire('assistant')
    assert.equal(key1, key2)
  })

  it('expires session after timeout', async () => {
    const mgr = new BrowserSessionManager({ sessionTimeoutMs: 1 })
    mgr.acquire('assistant')
    await new Promise((r) => setTimeout(r, 5))
    assert.equal(mgr.hasSession('assistant'), false)
  })

  it('isolates by agent', () => {
    const mgr = new BrowserSessionManager()
    mgr.acquire('agent-a')
    mgr.acquire('agent-b')
    mgr.release('agent-a')
    assert.equal(mgr.hasSession('agent-a'), false)
    assert.equal(mgr.hasSession('agent-b'), true)
  })

  it('cleanup removes expired', async () => {
    const mgr = new BrowserSessionManager({ sessionTimeoutMs: 1 })
    mgr.acquire('agent-a')
    mgr.acquire('agent-b')
    await new Promise((r) => setTimeout(r, 5))
    mgr.cleanup()
    assert.equal(mgr.hasSession('agent-a'), false)
    assert.equal(mgr.hasSession('agent-b'), false)
  })
})
