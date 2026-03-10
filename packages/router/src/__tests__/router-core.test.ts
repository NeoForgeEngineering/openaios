import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import type { BudgetCheckResult, BudgetManager } from '@openaios/budget'
import {
  MockChannel,
  MockGovernance,
  MockRunner,
  MockSessionStore,
} from '@openaios/core/testing'
import type { AgentRoute } from '../router-core.js'
import { RouterCore } from '../router-core.js'

// ---------------------------------------------------------------------------
// Minimal BudgetManager mock
// ---------------------------------------------------------------------------
function makeMockBudget(override?: Partial<BudgetCheckResult>): BudgetManager {
  const check: BudgetCheckResult = { allowed: true, ...override }
  return {
    check: (_agentName: string, requestedModel: string) => ({
      ...check,
      effectiveModel: check.effectiveModel ?? requestedModel,
    }),
    record: () => {},
    close: () => {},
  } as unknown as BudgetManager
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRoute(
  channel: MockChannel,
  runner: MockRunner,
  overrides?: Partial<AgentRoute>,
): AgentRoute {
  return {
    agentName: 'test-agent',
    defaultModel: 'test-model',
    runner,
    channel,
    ...overrides,
  }
}

function makeInbound(overrides = {}) {
  return {
    messageId: 'msg-1',
    source: { id: 'chat-100' },
    userId: 'user-42',
    text: 'Hello!',
    timestamp: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('RouterCore', () => {
  let governance: MockGovernance
  let sessionStore: MockSessionStore
  let budget: BudgetManager
  let runner: MockRunner
  let channel: MockChannel

  beforeEach(() => {
    governance = new MockGovernance()
    sessionStore = new MockSessionStore()
    budget = makeMockBudget()
    runner = new MockRunner()
    channel = new MockChannel()
  })

  function makeRouter(routeOverrides?: Partial<AgentRoute>) {
    return new RouterCore({
      routes: [makeRoute(channel, runner, routeOverrides)],
      sessionStore,
      governance,
      budget,
    })
  }

  // AC9: Message > 16KB → error sent, runner not called
  test('rejects messages over 16KB', async () => {
    makeRouter()
    await channel.simulateMessage(
      makeInbound({ text: 'x'.repeat(16 * 1024 + 1) }),
    )

    assert.equal(runner.calls.length, 0)
    assert.equal(channel.sent.length, 1)
    assert.ok(channel.sent[0]?.msg.text.includes('too long'))
  })

  // AC10: Budget exceeded → error sent, runner not called
  test('sends budget error and skips runner when budget exceeded', async () => {
    budget = makeMockBudget({ allowed: false, reason: 'over budget' })
    const router = new RouterCore({
      routes: [makeRoute(channel, runner)],
      sessionStore,
      governance,
      budget,
    })
    void router // suppress unused warning

    await channel.simulateMessage(makeInbound())

    assert.equal(runner.calls.length, 0)
    assert.equal(channel.sent.length, 1)
    assert.ok(channel.sent[0]?.msg.text.includes('budget'))
  })

  // AC11: Runner receives sessionKey and message
  test('calls runner with sessionKey and message', async () => {
    makeRouter()
    await channel.simulateMessage(makeInbound())

    assert.equal(runner.calls.length, 1)
    assert.equal(runner.calls[0]?.sessionKey, 'mock:user-42')
    assert.equal(runner.calls[0]?.message, 'Hello!')
    assert.equal(runner.calls[0]?.modelOverride, undefined)
  })

  // AC13: Runner throws → generic error sent to channel, no crash
  test('sends error message and does not crash when runner throws', async () => {
    runner.run = async () => {
      throw new Error('model unavailable')
    }
    makeRouter()

    await channel.simulateMessage(makeInbound())

    assert.equal(runner.calls.length, 0) // our mock throws before calls is set
    assert.equal(channel.sent.length, 1)
    assert.ok(channel.sent[0]?.msg.text.includes('went wrong'))
  })

  // AC12b: Session is updated after successful turn (totalCostUsd accumulates)
  test('persists updated session after successful turn', async () => {
    runner.response = {
      output: 'done',
      costUsd: 0.001,
    }
    makeRouter()

    await channel.simulateMessage(makeInbound())

    const session = await sessionStore.get({
      agentName: 'test-agent',
      userId: 'mock:user-42',
    })
    assert.ok(session)
    assert.equal(session.totalCostUsd, 0.001)
  })

  // Budget downgrade: effectiveModel differs → modelOverride passed to runner
  test('passes modelOverride when budget downgrades model', async () => {
    budget = makeMockBudget({ allowed: true, effectiveModel: 'cheap-model' })
    const router = new RouterCore({
      routes: [makeRoute(channel, runner)],
      sessionStore,
      governance,
      budget,
    })
    void router

    await channel.simulateMessage(makeInbound())

    assert.equal(runner.calls[0]?.modelOverride, 'cheap-model')
  })

  // No downgrade: modelOverride should be absent
  test('does not pass modelOverride when model is unchanged', async () => {
    makeRouter()
    await channel.simulateMessage(makeInbound())

    assert.equal(runner.calls[0]?.modelOverride, undefined)
  })
})
