import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import type { BudgetCheckResult, BudgetManager } from '@openaios/budget'
import {
  MockGovernance,
  MockRunner,
  MockSessionStore,
} from '@openaios/core/testing'
import type { AgentBusEntry } from '../agent-bus.js'
import {
  AgentBus,
  AgentCallDeniedError,
  AgentNotFoundError,
} from '../agent-bus.js'

// ---------------------------------------------------------------------------
// Minimal BudgetManager mock — only the methods AgentBus uses
// ---------------------------------------------------------------------------
function makeMockBudget(override?: Partial<BudgetCheckResult>): BudgetManager {
  const check: BudgetCheckResult = {
    allowed: true,
    effectiveModel: 'test-model',
    ...override,
  }
  const recorded: Array<{ agent: string; cost: number }> = []
  return {
    check: (_agentName: string, requestedModel: string) => ({
      ...check,
      effectiveModel: check.effectiveModel ?? requestedModel,
    }),
    record: (agent: string, cost: number) => recorded.push({ agent, cost }),
    _recorded: recorded,
  } as unknown as BudgetManager
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEntry(overrides?: Partial<AgentBusEntry>): AgentBusEntry {
  return {
    runner: new MockRunner(),
    defaultModel: 'test-model',
    allowedCallees: [],
    ...overrides,
  }
}

function makeRequest(overrides = {}) {
  return {
    fromAgent: 'caller',
    toAgent: 'callee',
    message: 'hello',
    callerSessionKey: 'telegram:123',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AgentBus', () => {
  let governance: MockGovernance
  let sessionStore: MockSessionStore
  let budget: BudgetManager
  let bus: AgentBus

  beforeEach(() => {
    governance = new MockGovernance()
    sessionStore = new MockSessionStore()
    budget = makeMockBudget()
    bus = new AgentBus({ governance, sessionStore, budget })
  })

  // AC1: toAgent not registered → AgentNotFoundError
  test('throws AgentNotFoundError when toAgent is not registered', async () => {
    bus.register('caller', makeEntry({ allowedCallees: ['callee'] }))

    await assert.rejects(
      () => bus.request(makeRequest()),
      (err: unknown) => {
        assert.ok(err instanceof AgentNotFoundError)
        assert.ok((err as Error).message.includes('callee'))
        return true
      },
    )
  })

  // AC2: Governance returns DENY → AgentCallDeniedError
  test('throws AgentCallDeniedError when governance denies', async () => {
    governance.decision = { allowed: false, reason: 'policy violation' }
    bus.register('caller', makeEntry({ allowedCallees: ['callee'] }))
    bus.register('callee', makeEntry())

    await assert.rejects(
      () => bus.request(makeRequest()),
      (err: unknown) => {
        assert.ok(err instanceof AgentCallDeniedError)
        assert.ok((err as Error).message.includes('policy violation'))
        return true
      },
    )
  })

  // AC3: toAgent not in allowedCallees → AgentCallDeniedError
  test('throws AgentCallDeniedError when toAgent not in allowedCallees', async () => {
    bus.register('caller', makeEntry({ allowedCallees: [] })) // callee NOT listed
    bus.register('callee', makeEntry())

    await assert.rejects(
      () => bus.request(makeRequest()),
      (err: unknown) => {
        assert.ok(err instanceof AgentCallDeniedError)
        assert.ok((err as Error).message.includes('allowedCallees'))
        return true
      },
    )
  })

  // AC4: Budget exceeded for toAgent → throws
  test('throws when budget is exceeded for toAgent', async () => {
    budget = makeMockBudget({ allowed: false, reason: 'monthly limit reached' })
    bus = new AgentBus({ governance, sessionStore, budget })
    bus.register('caller', makeEntry({ allowedCallees: ['callee'] }))
    bus.register('callee', makeEntry())

    await assert.rejects(
      () => bus.request(makeRequest()),
      (err: unknown) => {
        assert.ok((err as Error).message.includes('monthly limit reached'))
        return true
      },
    )
  })

  // AC5: Runner receives sessionKey and message
  test('calls runner with scoped sessionKey and message', async () => {
    const runner = new MockRunner()
    bus.register('caller', makeEntry({ allowedCallees: ['callee'] }))
    bus.register('callee', makeEntry({ runner, defaultModel: 'test-model' }))

    await bus.request(makeRequest({ message: 'do something' }))

    assert.equal(runner.calls.length, 1)
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    const input = runner.calls[0]!
    assert.equal(input.sessionKey, 'bus:caller:telegram:123')
    assert.equal(input.message, 'do something')
    assert.equal(input.modelOverride, undefined)
  })

  // AC7: Successful call → budget recorded, governance events fired, response returned
  test('records budget and fires governance events on success', async () => {
    const runner = new MockRunner()
    runner.response = {
      output: 'done',
      costUsd: 0.002,
    }
    const recorded: Array<{ agent: string; cost: number }> = []
    budget = {
      check: (_: string, model: string) => ({
        allowed: true,
        effectiveModel: model,
      }),
      record: (agent: string, cost: number) => recorded.push({ agent, cost }),
    } as unknown as BudgetManager

    bus = new AgentBus({ governance, sessionStore, budget })
    bus.register('caller', makeEntry({ allowedCallees: ['callee'] }))
    bus.register('callee', makeEntry({ runner }))

    const response = await bus.request(makeRequest())

    assert.equal(response.output, 'done')
    assert.equal(response.costUsd, 0.002)
    assert.equal(recorded.length, 1)
    assert.equal(recorded[0]?.agent, 'callee')
    assert.equal(recorded[0]?.cost, 0.002)
    assert.equal(governance.toolUseEvents.length, 1)
    assert.equal(governance.toolUseEvents[0]?.tool, 'call_agent')
    assert.equal(governance.turnCostEvents.length, 1)
    assert.equal(governance.turnCostEvents[0]?.agentName, 'callee')
  })

  // AC7b: Session totalCostUsd accumulates across calls
  test('persists session with accumulated cost after successful call', async () => {
    const runner = new MockRunner()
    runner.response = {
      output: 'result',
      costUsd: 0.001,
    }
    bus.register('caller', makeEntry({ allowedCallees: ['callee'] }))
    bus.register('callee', makeEntry({ runner }))

    await bus.request(makeRequest())

    const session = await sessionStore.get({
      agentName: 'callee',
      userId: 'bus:caller:telegram:123',
    })
    assert.ok(session)
    assert.equal(session.totalCostUsd, 0.001)
    assert.equal(session.agentName, 'callee')
  })

  // AC8: fromAgent not registered → denied (unregistered callers cannot bypass allowedCallees)
  test('denies call when fromAgent is not registered on the bus', async () => {
    // caller is NOT registered — no entry means no allowedCallees, so must be denied
    bus.register('callee', makeEntry())

    await assert.rejects(
      () => bus.request(makeRequest()),
      (err: unknown) => {
        assert.ok(err instanceof AgentCallDeniedError)
        assert.ok((err as Error).message.includes('allowedCallees'))
        return true
      },
    )
  })
})
