import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reasoningArgs, suggestModel } from '../reasoning.js'

describe('reasoningArgs', () => {
  it('standard returns empty array', () => {
    assert.deepEqual(reasoningArgs('standard'), [])
  })

  it('fast disables thinking', () => {
    assert.deepEqual(reasoningArgs('fast'), ['--thinking-budget', '0'])
  })

  it('deep sets high thinking budget', () => {
    assert.deepEqual(reasoningArgs('deep'), ['--thinking-budget', '32000'])
  })
})

describe('suggestModel', () => {
  it('returns default for standard mode', () => {
    assert.equal(suggestModel('standard', 'sonnet', 'opus'), 'sonnet')
  })

  it('returns default for fast mode', () => {
    assert.equal(suggestModel('fast', 'sonnet', 'opus'), 'sonnet')
  })

  it('returns premium for deep mode when available', () => {
    assert.equal(suggestModel('deep', 'sonnet', 'opus'), 'opus')
  })

  it('returns default for deep mode when no premium', () => {
    assert.equal(suggestModel('deep', 'sonnet'), 'sonnet')
  })
})
