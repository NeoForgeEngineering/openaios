import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { EmbeddingProvider } from '../embedding-provider.js'
import { MemoryStore } from '../memory-store.js'

// Simple deterministic mock embedding provider
class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 4

  async embed(text: string): Promise<Float32Array> {
    // Deterministic: hash characters into a 4-dim vector
    const vec = new Float32Array(4)
    for (let i = 0; i < text.length; i++) {
      vec[i % 4]! += text.charCodeAt(i) / 1000
    }
    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
    if (norm > 0) {
      for (let i = 0; i < 4; i++) vec[i]! /= norm
    }
    return vec
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((t) => this.embed(t)))
  }
}

let tmpDir: string
let store: MemoryStore

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'openaios-memory-test-'))
  store = new MemoryStore({
    dir: tmpDir,
    embeddingProvider: new MockEmbeddingProvider(),
    topK: 5,
    decayHalfLifeDays: 30,
  })
})

afterEach(() => {
  store.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('MemoryStore CRUD', () => {
  it('store and get a memory', async () => {
    await store.store('assistant', 'greeting', 'Hello world', {
      source: 'user',
    })
    const entry = await store.get('assistant', 'greeting')

    assert.ok(entry)
    assert.equal(entry.key, 'greeting')
    assert.equal(entry.content, 'Hello world')
    assert.deepEqual(entry.metadata, { source: 'user' })
    assert.ok(entry.createdAt)
    assert.ok(entry.updatedAt)
  })

  it('get returns undefined for missing key', async () => {
    const entry = await store.get('assistant', 'nonexistent')
    assert.equal(entry, undefined)
  })

  it('per-agent isolation', async () => {
    await store.store('agent-a', 'key1', 'A content')
    await store.store('agent-b', 'key1', 'B content')

    const a = await store.get('agent-a', 'key1')
    const b = await store.get('agent-b', 'key1')

    assert.equal(a?.content, 'A content')
    assert.equal(b?.content, 'B content')
  })

  it('delete removes memory', async () => {
    await store.store('assistant', 'temp', 'temporary')
    await store.delete('assistant', 'temp')

    const entry = await store.get('assistant', 'temp')
    assert.equal(entry, undefined)
  })

  it('delete non-existent key is no-op', async () => {
    // Should not throw
    await store.delete('assistant', 'nonexistent')
  })

  it('upsert updates existing memory', async () => {
    await store.store('assistant', 'key1', 'original')
    await store.store('assistant', 'key1', 'updated')

    const entry = await store.get('assistant', 'key1')
    assert.equal(entry?.content, 'updated')
  })

  it('store without metadata', async () => {
    await store.store('assistant', 'plain', 'just text')
    const entry = await store.get('assistant', 'plain')

    assert.ok(entry)
    assert.equal(entry.metadata, undefined)
  })
})

describe('MemoryStore search', () => {
  it('returns empty array for empty store', async () => {
    const results = await store.search('assistant', 'anything')
    assert.deepEqual(results, [])
  })

  it('returns matching memories', async () => {
    await store.store('assistant', 'cats', 'cats are great pets')
    await store.store('assistant', 'dogs', 'dogs are loyal companions')
    await store.store('assistant', 'weather', 'the weather is nice today')

    const results = await store.search('assistant', 'pets animals cats dogs')
    assert.ok(results.length > 0)
    // All results should have scores
    for (const r of results) {
      assert.ok(r.score !== undefined)
    }
  })

  it('respects topK', async () => {
    for (let i = 0; i < 10; i++) {
      await store.store('assistant', `item-${i}`, `Content number ${i}`)
    }

    const results = await store.search('assistant', 'content number', {
      topK: 3,
    })
    assert.ok(results.length <= 3)
  })

  it('isolates by agent', async () => {
    await store.store('agent-a', 'secret', 'A secret data')
    await store.store('agent-b', 'public', 'B public data')

    const results = await store.search('agent-a', 'data')
    const keys = results.map((r) => r.key)
    assert.ok(!keys.includes('public'))
  })
})

describe('MemoryStore buildPromptContext', () => {
  it('returns empty string for empty store', async () => {
    const ctx = await store.buildPromptContext('assistant', 'query', 100)
    assert.equal(ctx, '')
  })

  it('returns formatted context', async () => {
    await store.store('assistant', 'fact', 'The sky is blue')
    const ctx = await store.buildPromptContext('assistant', 'sky color', 200)
    assert.ok(ctx.includes('Relevant Memories'))
  })
})
