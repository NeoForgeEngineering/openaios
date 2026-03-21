import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PathPolicy } from '../path-policy.js'

describe('PathPolicy', () => {
  it('allows when no rules configured for agent', () => {
    const pp = new PathPolicy({})
    const result = pp.check('assistant', '/anything')
    assert.equal(result.allowed, true)
  })

  it('allows path matching allowlist', () => {
    const pp = new PathPolicy({
      assistant: { allow: ['/workspace/*'] },
    })
    assert.equal(pp.check('assistant', '/workspace/file.ts').allowed, true)
  })

  it('denies path not in allowlist', () => {
    const pp = new PathPolicy({
      assistant: { allow: ['/workspace/*'] },
    })
    assert.equal(pp.check('assistant', '/etc/passwd').allowed, false)
  })

  it('deny takes precedence over allow', () => {
    const pp = new PathPolicy({
      assistant: {
        allow: ['/workspace/*'],
        deny: ['/workspace/.env'],
      },
    })
    assert.equal(pp.check('assistant', '/workspace/.env').allowed, false)
    assert.equal(pp.check('assistant', '/workspace/file.ts').allowed, true)
  })

  it('supports ** globstar', () => {
    const pp = new PathPolicy({
      assistant: { allow: ['/workspace/**'] },
    })
    assert.equal(
      pp.check('assistant', '/workspace/deep/nested/file.ts').allowed,
      true,
    )
  })

  it('isolates by agent', () => {
    const pp = new PathPolicy({
      'agent-a': { allow: ['/a/*'] },
      'agent-b': { allow: ['/b/*'] },
    })
    assert.equal(pp.check('agent-a', '/a/file').allowed, true)
    assert.equal(pp.check('agent-a', '/b/file').allowed, false)
  })

  it('allows everything when only deny list (no allow)', () => {
    const pp = new PathPolicy({
      assistant: { deny: ['/workspace/.env'] },
    })
    assert.equal(pp.check('assistant', '/workspace/file.ts').allowed, true)
    assert.equal(pp.check('assistant', '/workspace/.env').allowed, false)
  })
})
