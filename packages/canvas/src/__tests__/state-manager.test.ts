import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CanvasStateManager } from '../state-manager.js'

describe('CanvasStateManager', () => {
  it('push adds components', () => {
    const mgr = new CanvasStateManager()
    const msg = mgr.push('sess-1', [
      { id: 'c1', type: 'markdown', props: { content: 'hello' } },
    ])

    assert.equal(msg.type, 'canvas:push')
    assert.equal(msg.components?.length, 1)
    assert.equal(mgr.getState('sess-1').length, 1)
  })

  it('update replaces a component', () => {
    const mgr = new CanvasStateManager()
    mgr.push('sess-1', [
      { id: 'c1', type: 'markdown', props: { content: 'v1' } },
    ])

    const msg = mgr.update('sess-1', {
      id: 'c1',
      type: 'markdown',
      props: { content: 'v2' },
    })

    assert.equal(msg.type, 'canvas:update')
    assert.equal(mgr.getComponent('sess-1', 'c1')?.props.content, 'v2')
  })

  it('remove deletes a component', () => {
    const mgr = new CanvasStateManager()
    mgr.push('sess-1', [
      { id: 'c1', type: 'markdown', props: { content: 'hello' } },
      { id: 'c2', type: 'button', props: { label: 'click' } },
    ])

    const msg = mgr.remove('sess-1', 'c1')
    assert.equal(msg.type, 'canvas:remove')
    assert.equal(mgr.getState('sess-1').length, 1)
    assert.equal(mgr.getComponent('sess-1', 'c1'), undefined)
  })

  it('reset clears all components', () => {
    const mgr = new CanvasStateManager()
    mgr.push('sess-1', [{ id: 'c1', type: 'markdown', props: {} }])

    const msg = mgr.reset('sess-1')
    assert.equal(msg.type, 'canvas:reset')
    assert.equal(mgr.getState('sess-1').length, 0)
    assert.equal(mgr.hasSession('sess-1'), false)
  })

  it('getState returns empty for unknown session', () => {
    const mgr = new CanvasStateManager()
    assert.deepEqual(mgr.getState('unknown'), [])
  })

  it('sorts by order', () => {
    const mgr = new CanvasStateManager()
    mgr.push('sess-1', [
      { id: 'c2', type: 'markdown', props: {}, order: 2 },
      { id: 'c1', type: 'markdown', props: {}, order: 1 },
      { id: 'c3', type: 'markdown', props: {}, order: 3 },
    ])

    const state = mgr.getState('sess-1')
    assert.equal(state[0]?.id, 'c1')
    assert.equal(state[1]?.id, 'c2')
    assert.equal(state[2]?.id, 'c3')
  })

  it('listSessions returns active sessions', () => {
    const mgr = new CanvasStateManager()
    mgr.push('sess-1', [{ id: 'c1', type: 'markdown', props: {} }])
    mgr.push('sess-2', [{ id: 'c2', type: 'button', props: {} }])

    assert.deepEqual(mgr.listSessions().sort(), ['sess-1', 'sess-2'])
  })

  it('destroySession cleans up', () => {
    const mgr = new CanvasStateManager()
    mgr.push('sess-1', [{ id: 'c1', type: 'markdown', props: {} }])
    mgr.destroySession('sess-1')
    assert.equal(mgr.hasSession('sess-1'), false)
  })
})
