import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ModelCatalog } from '../model-catalog.js'

describe('ModelCatalog', () => {
  it('returns known Anthropic models', async () => {
    const catalog = new ModelCatalog()
    const models = await catalog.discover('anthropic')
    assert.ok(models.length >= 3)
    assert.ok(models.some((m) => m.id.includes('opus')))
    assert.ok(models.some((m) => m.id.includes('sonnet')))
  })

  it('caches results', async () => {
    const catalog = new ModelCatalog()
    const first = await catalog.discover('anthropic')
    const second = await catalog.discover('anthropic')
    assert.equal(first, second) // Same reference (cached)
  })

  it('invalidate clears cache', async () => {
    const catalog = new ModelCatalog()
    await catalog.discover('anthropic')
    catalog.invalidate('anthropic')
    const after = await catalog.discover('anthropic')
    assert.ok(after.length >= 3) // Re-fetched
  })

  it('all() returns cached models', async () => {
    const catalog = new ModelCatalog()
    await catalog.discover('anthropic')
    const all = catalog.all()
    assert.ok(all.length >= 3)
  })

  it('gracefully handles failed discovery', async () => {
    const catalog = new ModelCatalog()
    // Ollama likely not running in test — should return empty, not throw
    const models = await catalog.discover('ollama', {
      baseUrl: 'http://localhost:99999',
    })
    assert.deepEqual(models, [])
  })
})
