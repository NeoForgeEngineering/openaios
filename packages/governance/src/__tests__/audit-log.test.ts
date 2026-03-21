import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AuditLog } from '../audit-log.js'

let tmpDir: string
let audit: AuditLog

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'audit-test-'))
  audit = new AuditLog(join(tmpDir, 'audit.db'))
})

afterEach(() => {
  audit.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('AuditLog', () => {
  it('logs and queries an entry', () => {
    audit.log({
      agentName: 'assistant',
      sessionKey: 'sess-1',
      eventType: 'tool_use',
      tool: 'web_fetch',
      detail: 'allowed',
      timestampMs: Date.now(),
    })

    const results = audit.query({ agentName: 'assistant' })
    assert.equal(results.length, 1)
    assert.equal(results[0]?.agentName, 'assistant')
    assert.equal(results[0]?.tool, 'web_fetch')
    assert.equal(results[0]?.detail, 'allowed')
  })

  it('filters by eventType', () => {
    audit.log({
      agentName: 'assistant',
      sessionKey: 'sess-1',
      eventType: 'tool_use',
      detail: 'allowed',
      timestampMs: Date.now(),
    })
    audit.log({
      agentName: 'assistant',
      sessionKey: 'sess-1',
      eventType: 'rate_limit',
      detail: 'exceeded',
      timestampMs: Date.now(),
    })

    const results = audit.query({ eventType: 'rate_limit' })
    assert.equal(results.length, 1)
    assert.equal(results[0]?.eventType, 'rate_limit')
  })

  it('respects query limit', () => {
    for (let i = 0; i < 10; i++) {
      audit.log({
        agentName: 'assistant',
        sessionKey: 'sess-1',
        eventType: 'tool_use',
        detail: `event ${i}`,
        timestampMs: Date.now() + i,
      })
    }

    const results = audit.query({ limit: 3 })
    assert.equal(results.length, 3)
  })

  it('prunes old entries', () => {
    const oldTime = Date.now() - 100 * 86_400_000 // 100 days ago
    audit.log({
      agentName: 'assistant',
      sessionKey: 'sess-1',
      eventType: 'tool_use',
      detail: 'old',
      timestampMs: oldTime,
    })
    audit.log({
      agentName: 'assistant',
      sessionKey: 'sess-1',
      eventType: 'tool_use',
      detail: 'recent',
      timestampMs: Date.now(),
    })

    const pruned = audit.prune(30)
    assert.equal(pruned, 1)

    const remaining = audit.query({})
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0]?.detail, 'recent')
  })

  it('returns empty array for no matches', () => {
    const results = audit.query({ agentName: 'nonexistent' })
    assert.deepEqual(results, [])
  })
})
