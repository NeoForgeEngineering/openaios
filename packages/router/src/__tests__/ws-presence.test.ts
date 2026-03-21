import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WsPresence } from '../ws-presence.js'

describe('WsPresence', () => {
  it('tracks connections', () => {
    const p = new WsPresence()
    p.connect('client-1')
    p.connect('client-2')
    assert.equal(p.connectedCount, 2)
    assert.deepEqual(p.getConnected().sort(), ['client-1', 'client-2'])
  })

  it('handles disconnect', () => {
    const p = new WsPresence()
    p.connect('client-1')
    p.disconnect('client-1')
    assert.equal(p.connectedCount, 0)
  })

  it('tracks typing', () => {
    const p = new WsPresence()
    p.setTyping('user-1')
    assert.deepEqual(p.getTyping(), ['user-1'])
  })

  it('clears typing', () => {
    const p = new WsPresence()
    p.setTyping('user-1')
    p.clearTyping('user-1')
    assert.deepEqual(p.getTyping(), [])
  })

  it('disconnect clears typing', () => {
    const p = new WsPresence()
    p.connect('user-1')
    p.setTyping('user-1')
    p.disconnect('user-1')
    assert.deepEqual(p.getTyping(), [])
  })
})
