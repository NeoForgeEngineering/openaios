import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { ObservabilityStore } from '../store.js'

let tmpDir: string
let store: ObservabilityStore

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'obs-test-'))
  store = new ObservabilityStore(join(tmpDir, 'obs.db'))
})

afterEach(() => {
  store.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('ObservabilityStore turns', () => {
  it('records and retrieves a turn', () => {
    store.recordTurn({
      agentName: 'assistant',
      sessionKey: 'telegram:123',
      channel: 'telegram',
      model: 'claude-haiku-4-5',
      userMessage: 'hello',
      agentMessage: 'hi there',
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0.001,
      durationMs: 500,
      timestampMs: Date.now(),
    })

    const recent = store.getRecentTurns({ agentName: 'assistant', limit: 5 })
    assert.equal(recent.length, 1)
    assert.equal(recent[0]?.userMessage, 'hello')
    assert.equal(recent[0]?.agentMessage, 'hi there')
    assert.equal(recent[0]?.inputTokens, 10)
    assert.equal(recent[0]?.costUsd, 0.001)
  })

  it('records tool calls with turn', () => {
    store.recordTurn({
      agentName: 'assistant',
      sessionKey: 's1',
      channel: 'webhook',
      model: 'gemini-2.5-flash',
      userMessage: 'read file',
      agentMessage: 'done',
      inputTokens: 50,
      outputTokens: 100,
      costUsd: 0.002,
      durationMs: 1000,
      timestampMs: Date.now(),
      toolCalls: [
        {
          tool: 'filesystem_read',
          input: '{"path":"x"}',
          output: 'content',
          allowed: true,
          durationMs: 5,
        },
        {
          tool: 'shell_exec',
          input: '{"command":"ls"}',
          output: '',
          allowed: false,
          durationMs: 0,
        },
      ],
    })

    const turns = store.getRecentTurns()
    assert.equal(turns.length, 1)
  })
})

describe('ObservabilityStore chat history', () => {
  it('records and retrieves messages', () => {
    store.recordMessage({
      agentName: 'assistant',
      sessionKey: 's1',
      role: 'user',
      content: 'hello',
      timestampMs: 1000,
    })
    store.recordMessage({
      agentName: 'assistant',
      sessionKey: 's1',
      role: 'assistant',
      content: 'hi',
      model: 'haiku',
      tokens: 30,
      costUsd: 0.001,
      timestampMs: 2000,
    })

    const history = store.getChatHistory('assistant', 's1', { before: 3000 })
    assert.equal(history.length, 2)
    assert.equal(history[0]?.role, 'user')
    assert.equal(history[1]?.role, 'assistant')
    assert.equal(history[1]?.model, 'haiku')
  })

  it('scopes by agent + session', () => {
    store.recordMessage({
      agentName: 'a',
      sessionKey: 's1',
      role: 'user',
      content: 'a-s1',
      timestampMs: 1,
    })
    store.recordMessage({
      agentName: 'a',
      sessionKey: 's2',
      role: 'user',
      content: 'a-s2',
      timestampMs: 2,
    })
    store.recordMessage({
      agentName: 'b',
      sessionKey: 's1',
      role: 'user',
      content: 'b-s1',
      timestampMs: 3,
    })

    assert.equal(store.getChatHistory('a', 's1').length, 1)
    assert.equal(store.getChatHistory('a', 's2').length, 1)
    assert.equal(store.getChatHistory('b', 's1').length, 1)
  })

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      store.recordMessage({
        agentName: 'a',
        sessionKey: 's',
        role: 'user',
        content: `msg ${i}`,
        timestampMs: i,
      })
    }
    assert.equal(store.getChatHistory('a', 's', { limit: 3 }).length, 3)
  })
})

describe('ObservabilityStore metrics', () => {
  it('aggregates agent metrics', () => {
    const now = Date.now()
    store.recordTurn({
      agentName: 'a',
      sessionKey: 's',
      channel: 'wh',
      model: 'm',
      userMessage: '',
      agentMessage: '',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.01,
      durationMs: 500,
      timestampMs: now,
    })
    store.recordTurn({
      agentName: 'a',
      sessionKey: 's',
      channel: 'wh',
      model: 'm',
      userMessage: '',
      agentMessage: '',
      inputTokens: 150,
      outputTokens: 300,
      costUsd: 0.02,
      durationMs: 700,
      timestampMs: now + 1,
    })

    const m = store.getAgentMetrics('a')
    assert.equal(m.turns, 2)
    assert.equal(m.totalInputTokens, 250)
    assert.equal(m.totalOutputTokens, 500)
    assert.ok(Math.abs(m.totalCostUsd - 0.03) < 0.001)
    assert.equal(m.avgDurationMs, 600)
  })

  it('getAllMetrics returns per-agent', () => {
    store.recordTurn({
      agentName: 'a',
      sessionKey: 's',
      channel: 'wh',
      model: 'm',
      userMessage: '',
      agentMessage: '',
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0,
      durationMs: 100,
      timestampMs: Date.now(),
    })
    store.recordTurn({
      agentName: 'b',
      sessionKey: 's',
      channel: 'wh',
      model: 'm',
      userMessage: '',
      agentMessage: '',
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0,
      durationMs: 100,
      timestampMs: Date.now(),
    })

    const all = store.getAllMetrics()
    assert.equal(all.length, 2)
  })
})

describe('ObservabilityStore prune', () => {
  it('removes old data', () => {
    const old = Date.now() - 100 * 86_400_000
    store.recordTurn({
      agentName: 'a',
      sessionKey: 's',
      channel: 'wh',
      model: 'm',
      userMessage: '',
      agentMessage: '',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: 0,
      timestampMs: old,
    })
    store.recordMessage({
      agentName: 'a',
      sessionKey: 's',
      role: 'user',
      content: 'old',
      timestampMs: old,
    })
    store.recordTurn({
      agentName: 'a',
      sessionKey: 's',
      channel: 'wh',
      model: 'm',
      userMessage: '',
      agentMessage: '',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: 0,
      timestampMs: Date.now(),
    })

    const pruned = store.prune(30)
    assert.equal(pruned.turns, 1)
    assert.equal(pruned.messages, 1)
    assert.equal(store.getRecentTurns().length, 1)
  })
})
