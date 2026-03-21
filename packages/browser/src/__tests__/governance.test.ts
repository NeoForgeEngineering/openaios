import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BrowserGovernance } from '../governance.js'

describe('BrowserGovernance', () => {
  it('allows all URLs with no rules', () => {
    const gov = new BrowserGovernance()
    assert.equal(gov.check('https://example.com').allowed, true)
  })

  it('denies URL matching denylist', () => {
    const gov = new BrowserGovernance({
      urlDenylist: ['https://evil.com/*'],
    })
    assert.equal(gov.check('https://evil.com/page').allowed, false)
    assert.equal(gov.check('https://good.com/page').allowed, true)
  })

  it('denies URL not in allowlist', () => {
    const gov = new BrowserGovernance({
      urlAllowlist: ['https://example.com/*'],
    })
    assert.equal(gov.check('https://other.com/page').allowed, false)
    assert.equal(gov.check('https://example.com/page').allowed, true)
  })

  it('deny takes precedence over allow', () => {
    const gov = new BrowserGovernance({
      urlAllowlist: ['https://example.com/*'],
      urlDenylist: ['https://example.com/admin*'],
    })
    assert.equal(gov.check('https://example.com/page').allowed, true)
    assert.equal(gov.check('https://example.com/admin').allowed, false)
  })

  it('supports ** globstar', () => {
    const gov = new BrowserGovernance({
      urlAllowlist: ['https://docs.example.com/**'],
    })
    assert.equal(gov.check('https://docs.example.com/a/b/c').allowed, true)
  })
})
