import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { JobHistory } from '../job-history.js'

let tmpDir: string
let history: JobHistory

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'job-history-test-'))
  history = new JobHistory(join(tmpDir, 'jobs.db'))
})

afterEach(() => {
  history.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('JobHistory', () => {
  it('records and lists a job', () => {
    history.record({
      jobName: 'daily',
      agentName: 'assistant',
      status: 'success',
      durationMs: 1500,
      timestampMs: Date.now(),
    })

    const results = history.list({ jobName: 'daily' })
    assert.equal(results.length, 1)
    assert.equal(results[0]?.jobName, 'daily')
    assert.equal(results[0]?.status, 'success')
    assert.equal(results[0]?.durationMs, 1500)
  })

  it('records error jobs', () => {
    history.record({
      jobName: 'failing',
      agentName: 'assistant',
      status: 'error',
      durationMs: 100,
      error: 'timeout',
      timestampMs: Date.now(),
    })

    const results = history.list({ jobName: 'failing' })
    assert.equal(results[0]?.status, 'error')
    assert.equal(results[0]?.error, 'timeout')
  })

  it('filters by agentName', () => {
    history.record({
      jobName: 'job1',
      agentName: 'agent-a',
      status: 'success',
      durationMs: 100,
      timestampMs: Date.now(),
    })
    history.record({
      jobName: 'job2',
      agentName: 'agent-b',
      status: 'success',
      durationMs: 100,
      timestampMs: Date.now(),
    })

    const results = history.list({ agentName: 'agent-a' })
    assert.equal(results.length, 1)
    assert.equal(results[0]?.agentName, 'agent-a')
  })

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      history.record({
        jobName: 'job',
        agentName: 'assistant',
        status: 'success',
        durationMs: 100,
        timestampMs: Date.now() + i,
      })
    }

    const results = history.list({ limit: 3 })
    assert.equal(results.length, 3)
  })

  it('orders by timestamp desc', () => {
    history.record({
      jobName: 'old',
      agentName: 'assistant',
      status: 'success',
      durationMs: 100,
      timestampMs: 1000,
    })
    history.record({
      jobName: 'new',
      agentName: 'assistant',
      status: 'success',
      durationMs: 100,
      timestampMs: 2000,
    })

    const results = history.list()
    assert.equal(results[0]?.jobName, 'new')
    assert.equal(results[1]?.jobName, 'old')
  })

  it('prunes old entries', () => {
    history.record({
      jobName: 'old',
      agentName: 'assistant',
      status: 'success',
      durationMs: 100,
      timestampMs: Date.now() - 100 * 86_400_000,
    })
    history.record({
      jobName: 'recent',
      agentName: 'assistant',
      status: 'success',
      durationMs: 100,
      timestampMs: Date.now(),
    })

    const pruned = history.prune(30)
    assert.equal(pruned, 1)
    assert.equal(history.list().length, 1)
  })
})
