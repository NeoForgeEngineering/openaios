import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PluginLifecycle } from '../lifecycle.js'

describe('PluginLifecycle', () => {
  it('follows happy path: discovered → installed → enabled', () => {
    const lc = new PluginLifecycle()
    lc.register('test')
    assert.equal(lc.getState('test'), 'discovered')

    lc.install('test')
    assert.equal(lc.getState('test'), 'installed')

    lc.enable('test')
    assert.equal(lc.getState('test'), 'enabled')
  })

  it('enable → disable → enable cycle', () => {
    const lc = new PluginLifecycle()
    lc.register('test')
    lc.install('test')
    lc.enable('test')
    lc.disable('test')
    assert.equal(lc.getState('test'), 'disabled')

    lc.enable('test')
    assert.equal(lc.getState('test'), 'enabled')
  })

  it('throws on invalid transitions', () => {
    const lc = new PluginLifecycle()
    lc.register('test')

    // Can't enable from discovered
    assert.throws(() => lc.enable('test'), /Cannot enable/)

    // Can't disable from discovered
    assert.throws(() => lc.disable('test'), /Cannot disable/)
  })

  it('markError from any state', () => {
    const lc = new PluginLifecycle()
    lc.register('test')
    lc.markError('test', 'crash')
    assert.equal(lc.getState('test'), 'error')
  })

  it('listByState filters correctly', () => {
    const lc = new PluginLifecycle()
    lc.register('a')
    lc.register('b')
    lc.install('a')
    lc.enable('a')

    assert.equal(lc.listByState('enabled').length, 1)
    assert.equal(lc.listByState('discovered').length, 1)
  })

  it('listAll returns everything', () => {
    const lc = new PluginLifecycle()
    lc.register('a')
    lc.register('b')
    assert.equal(lc.listAll().length, 2)
  })

  it('throws for unknown plugin', () => {
    const lc = new PluginLifecycle()
    assert.throws(() => lc.getState('unknown'), /not found/)
  })
})
