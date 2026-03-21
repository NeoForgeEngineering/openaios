import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PluginManifestSchema, validateManifest } from '../manifest.js'

describe('PluginManifest', () => {
  it('validates a minimal manifest', () => {
    const manifest = validateManifest({
      name: 'my-plugin',
      displayName: 'My Plugin',
      version: '1.0.0',
      description: 'A test plugin',
    })
    assert.equal(manifest.name, 'my-plugin')
    assert.equal(manifest.main, 'index.js') // default
    assert.deepEqual(manifest.provides.tools, [])
  })

  it('validates full manifest', () => {
    const manifest = validateManifest({
      name: 'weather',
      displayName: 'Weather Plugin',
      version: '2.0.0',
      description: 'Provides weather tools',
      author: 'team',
      main: 'dist/index.js',
      provides: {
        tools: ['weather_forecast', 'weather_current'],
        channels: [],
        hooks: ['on_start'],
      },
    })
    assert.equal(manifest.provides.tools.length, 2)
    assert.equal(manifest.main, 'dist/index.js')
  })

  it('rejects invalid name', () => {
    assert.throws(() =>
      validateManifest({
        name: 'Invalid Name',
        displayName: 'Test',
        version: '1.0.0',
        description: 'test',
      }),
    )
  })

  it('rejects missing required fields', () => {
    assert.throws(() => validateManifest({ name: 'test' }))
  })

  it('schema is a zod object', () => {
    assert.ok(PluginManifestSchema.parse)
  })
})
