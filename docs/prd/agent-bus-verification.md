# PRD: Agent Bus Verification

## Problem Statement

The `AgentBus`, `RouterCore`, and related components were shipped without any automated tests. The `AgentBus` in particular contains multi-layered authorization logic, session management, and budget tracking that could silently fail or produce incorrect behaviour under edge cases. Without tests, regressions cannot be detected and correctness cannot be asserted.

## Target Users

openAIOS maintainers who need confidence that the agent bus enforces its authorization contract correctly before deploying in production.

## Success Criteria

1. `AgentBus.request()` is covered by unit tests using mock dependencies (no Docker, no DB, no network)
2. `RouterCore.handleMessage()` is covered by unit tests
3. All tests run via `pnpm test` in the router package
4. The following paths are verified: governance denial, callee not found, budget exceeded, allowedCallees check, successful call with session persistence, session resume, budget recording
5. Test suite runs in under 5 seconds

## Scope

**In scope:**
- `AgentBus` unit tests
- `RouterCore` unit tests

**Out of scope:**
- `ContainerOrchestrator` (requires Docker daemon)
- `CapabilityProvisioner` (requires Docker daemon)
- `DockerRunner` (requires Docker daemon)
- End-to-end integration tests
- Channel adapter tests
