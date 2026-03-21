import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cosineSimilarity, mmrRerank } from '../search/mmr-reranker.js'

describe('cosineSimilarity', () => {
  it('identical vectors have similarity 1', () => {
    const a = new Float32Array([1, 0, 0])
    const sim = cosineSimilarity(a, a)
    assert.ok(Math.abs(sim - 1.0) < 0.001)
  })

  it('orthogonal vectors have similarity 0', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([0, 1, 0])
    const sim = cosineSimilarity(a, b)
    assert.ok(Math.abs(sim) < 0.001)
  })

  it('opposite vectors have similarity -1', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([-1, 0, 0])
    const sim = cosineSimilarity(a, b)
    assert.ok(Math.abs(sim - -1.0) < 0.001)
  })

  it('handles zero vectors', () => {
    const zero = new Float32Array([0, 0, 0])
    const a = new Float32Array([1, 0, 0])
    assert.equal(cosineSimilarity(zero, a), 0)
  })
})

describe('mmrRerank', () => {
  it('returns all results when k >= length', () => {
    const items = [
      { score: 0.9, embedding: new Float32Array([1, 0, 0]) },
      { score: 0.8, embedding: new Float32Array([0, 1, 0]) },
    ]
    const query = new Float32Array([1, 0, 0])
    const result = mmrRerank(items, query, 0.7, 5)
    assert.equal(result.length, 2)
  })

  it('selects diverse results with low lambda', () => {
    // 3 similar items (cats) and 2 different (dogs)
    const cats = new Float32Array([0.9, 0.1, 0])
    const dogs = new Float32Array([0.1, 0.9, 0])
    const query = new Float32Array([0.5, 0.5, 0])

    const items = [
      { score: 0.95, embedding: cats, label: 'cat1' },
      {
        score: 0.93,
        embedding: new Float32Array([0.88, 0.12, 0]),
        label: 'cat2',
      },
      {
        score: 0.91,
        embedding: new Float32Array([0.87, 0.13, 0]),
        label: 'cat3',
      },
      { score: 0.85, embedding: dogs, label: 'dog1' },
      {
        score: 0.8,
        embedding: new Float32Array([0.12, 0.88, 0]),
        label: 'dog2',
      },
    ]

    // With lambda=0.5, diversity matters a lot
    const result = mmrRerank(items, query, 0.5, 3)
    const labels = result.map((r) => r.label)

    // Should include at least one dog (diversity)
    const hasDog = labels.some((l) => l.startsWith('dog'))
    assert.ok(hasDog, `Expected diversity but got: ${labels.join(', ')}`)
  })

  it('pure relevance with lambda=1', () => {
    const items = [
      { score: 0.9, embedding: new Float32Array([1, 0]) },
      { score: 0.5, embedding: new Float32Array([0, 1]) },
      { score: 0.8, embedding: new Float32Array([1, 0]) },
    ]
    const query = new Float32Array([1, 0])
    const result = mmrRerank(items, query, 1.0, 2)
    // Should pick highest scores
    assert.equal(result[0]?.score, 0.9)
    assert.equal(result[1]?.score, 0.8)
  })
})
