import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { PluginRegistry } from '../registry.js'

function createTestPlugin(dir: string, name: string): void {
  const pluginDir = join(dir, name)
  mkdirSync(pluginDir)
  writeFileSync(
    join(pluginDir, 'plugin.json'),
    JSON.stringify({
      name,
      displayName: `Test ${name}`,
      version: '1.0.0',
      description: `Test plugin ${name}`,
    }),
  )
}

describe('PluginRegistry', () => {
  it('discovers plugins from directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'plugins-test-'))
    createTestPlugin(dir, 'plugin-a')
    createTestPlugin(dir, 'plugin-b')

    const registry = new PluginRegistry({ dirs: [dir] })
    await registry.discoverAll()

    assert.equal(registry.list().length, 2)
    assert.ok(registry.get('plugin-a'))
    assert.ok(registry.get('plugin-b'))

    rmSync(dir, { recursive: true, force: true })
  })

  it('enable and disable plugins', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'plugins-test-'))
    createTestPlugin(dir, 'my-plugin')

    const registry = new PluginRegistry({ dirs: [dir] })
    await registry.discoverAll()

    registry.enable('my-plugin')
    assert.deepEqual(registry.enabled(), ['my-plugin'])

    registry.disable('my-plugin')
    assert.deepEqual(registry.enabled(), [])

    rmSync(dir, { recursive: true, force: true })
  })

  it('throws enabling unknown plugin', () => {
    const registry = new PluginRegistry({ dirs: [] })
    assert.throws(() => registry.enable('unknown'), /not found/)
  })

  it('skips non-existent directories', async () => {
    const registry = new PluginRegistry({ dirs: ['/nonexistent'] })
    await registry.discoverAll() // should not throw
    assert.equal(registry.list().length, 0)
  })

  it('skips invalid plugins gracefully', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'plugins-test-'))
    const badDir = join(dir, 'bad-plugin')
    mkdirSync(badDir)
    // No plugin.json or package.json

    const registry = new PluginRegistry({ dirs: [dir] })
    await registry.discoverAll() // should not throw
    assert.equal(registry.list().length, 0)

    rmSync(dir, { recursive: true, force: true })
  })
})
