# System Context — Agent Bus Verification

## C4 Level 1: System Boundary

```
┌─────────────────────────────────────────────────────┐
│  openAIOS Test Suite                                │
│                                                     │
│  ┌─────────────────┐    ┌─────────────────────────┐ │
│  │  AgentBus tests │    │  RouterCore tests       │ │
│  │  (16 cases)     │    │  (7 cases)              │ │
│  └────────┬────────┘    └──────────┬──────────────┘ │
│           │                        │                 │
│           └────────────┬───────────┘                 │
│                        │                             │
│              @openaios/core/testing                  │
│         (MockRunner, MockGovernance,                 │
│          MockSessionStore, MockChannel)              │
└─────────────────────────────────────────────────────┘
```

**External dependencies:** None. All tests use in-memory mocks. No Docker, database, or network access required.

**Test runner:** `tsx --test` via Node's built-in test runner (Node 22+).
