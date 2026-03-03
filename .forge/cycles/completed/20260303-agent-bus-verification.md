# Cycle: agent-bus-verification

**Created**: 2026-03-03T06:36:23.928641+00:00
**Priority**: medium
**Status**: Active

## Overview

Add unit tests for AgentBus and RouterCore — the two most critical untested components shipped in the container orchestration feature. Uses in-memory mocks, no external dependencies.

---

<!-- FORGE_PHASE:Focus:Complete -->
## Phase 1: Focus

**Purpose**: Define what you're building and why.

### Required Outputs
- [x] Problem statement and target users defined
- [x] Testable success criteria written
- [x] System Context diagram (C4 L1) created
- [x] Clear boundaries on what you WON'T build

### Notes

See `docs/prd/agent-bus-verification.md` and `docs/agent-bus-verification/system-context.md`.

Problem: AgentBus and RouterCore shipped without tests. Authorization logic, session management, and budget tracking could silently fail.
Target users: openAIOS maintainers.
Out of scope: ContainerOrchestrator, CapabilityProvisioner, DockerRunner (all require Docker daemon).

---

<!-- FORGE_PHASE:Orchestrate:Complete -->
## Phase 2: Orchestrate

**Purpose**: Break the work into session-sized pieces.

### Required Outputs
- [x] Container architecture (C4 L2) designed
- [x] Component architecture (C4 L3) designed
- [x] Dependency map created
- [x] Tasks sized for single AI sessions

### Tasks

- [x] Write AgentBus unit tests (9 cases covering authorization layers, session, budget)
- [x] Write RouterCore unit tests (7 cases covering dispatch, session resume, budget, error handling)
- [x] Configure test runner (tsx + Node built-in test runner)

### Dependency map

```
router package tests
  ├── @openaios/core/testing  (MockRunner, MockGovernance, MockSessionStore, MockChannel)
  ├── @openaios/budget        (BudgetManager type — mocked inline)
  └── tsx                     (TypeScript-aware test runner)
```

---

<!-- FORGE_PHASE:Refine:Complete -->
## Phase 3: Refine

**Purpose**: Define exactly what "done" looks like.

### Required Outputs
- [x] Acceptance criteria in Given-When-Then format
- [x] Interface specifications documented
- [x] Edge cases enumerated by category
- [x] Constraints vs criteria documented

### Acceptance Criteria — AgentBus

| # | Given | When | Then |
|---|---|---|---|
| AC1 | toAgent not registered | request() called | throws AgentNotFoundError |
| AC2 | Governance returns DENY | request() called | throws AgentCallDeniedError with reason |
| AC3 | toAgent not in allowedCallees | request() called | throws AgentCallDeniedError |
| AC4 | Budget exceeded for toAgent | request() called | throws with budget reason |
| AC5 | No prior session | request() called | runner receives input without claudeSessionId |
| AC6 | Prior session exists | request() called | runner receives claudeSessionId from session |
| AC7 | Successful call with cost | request() completes | budget recorded, governance events fired, costUsd in response |
| AC7b | Successful call | request() completes | session persisted |
| AC8 | fromAgent not registered | request() called | allowedCallees check skipped |

### Acceptance Criteria — RouterCore

| # | Given | When | Then |
|---|---|---|---|
| AC9 | Message > 16KB | message received | channel receives "too long" error, runner not called |
| AC10 | Budget exceeded | message received | channel receives budget error, runner not called |
| AC11 | No prior session | message received | runner called without claudeSessionId |
| AC12 | Prior session exists | message received | runner called with claudeSessionId |
| AC12b | Successful turn | turn completes | session persisted with new claudeSessionId |
| AC13 | Runner throws | message received | channel receives generic error, no crash |
| AC14 | Budget returns effectiveModel | message received | runner called with downgraded model |

---

<!-- FORGE_PHASE:Generate:Complete -->
## Phase 4: Generate

**Purpose**: AI writes code following TDD.

### Process
- [x] RED: Write failing tests (module-not-found errors confirmed tests were wired)
- [x] GREEN: Fixed test runner (tsx instead of --experimental-strip-types), all 16 pass
- [x] REFACTOR: Tests are clean, no changes needed

### Implementation Notes

- Added `tsx` devDependency to `@openaios/router`
- Test files: `src/__tests__/agent-bus.test.ts`, `src/__tests__/router-core.test.ts`
- 9 AgentBus tests + 7 RouterCore tests = 16 total, all passing
- Runtime: ~640ms

---

<!-- FORGE_PHASE:Evaluate:Active -->
## Phase 5: Evaluate

**Purpose**: Verify output matches intent.

### Checklist
- [x] Criteria verified line-by-line — all 16 AC mapped to passing tests
- [x] Edge cases tested — prior session, no session, budget exceeded, governance deny, allowedCallees missing, runner throws
- [x] Security review — no secrets in tests, mocks are isolated per test via beforeEach, no filesystem/network access
- [x] Integration tested — `pnpm test` passes in 640ms with zero external dependencies

### Disposition

**Accept** — all 16 acceptance criteria satisfied. 16/16 tests pass.

---

## Learnings

<!-- Capture learnings during and after the cycle -->
