---
title: Agent Bus
description: How agents communicate with each other through the governed agent bus.
sidebar:
  order: 3
---

The Agent Bus enables governed request/response communication between agents. It enforces two layers of authorization and tracks budget against the callee.

![Agent Bus Flow](/openaios/agent-bus.svg)

## Configuration

To allow Agent A to call Agent B:

```yaml
agents:
  - name: agent-a
    capabilities:
      agent-calls: [agent-b]    # declares which agents can be called
    permissions:
      allow: [call_agent, ...]  # auto-added when agent-calls is non-empty

  - name: agent-b
    # agent-b doesn't need any special config to be callable
```

## Two-layer authorization

Both layers must pass for a call to succeed:

1. **Governance check** — `GovernanceAdapter.checkPolicy()` verifies `call_agent` is in the caller's allowed tools
2. **Callee allowlist** — `AgentBus` checks that the target agent is in the caller's `capabilities.agent-calls`

## Call flow

### Inside Docker containers

The `call_agent` bash script is available in the agent Docker image:

```bash
# Inside agent-a's container
call_agent agent-b "Summarize this document for me"
```

This script:
1. Reads `OPENAIOS_BUS_URL` and `OPENAIOS_BUS_TOKEN` from environment (injected at container start)
2. Sends `POST /internal/bus/message` with bearer token auth
3. Prints the response output to stdout

### Bus HTTP server

The bus runs on `127.0.0.1:{bus_port}` (never exposed publicly):

```
POST /internal/bus/message
Authorization: Bearer {one-time-uuid-token}
Content-Type: application/json

{
  "fromAgent": "agent-a",
  "toAgent": "agent-b",
  "message": "Summarize this document for me",
  "callerSessionKey": "telegram:user123"
}
```

### Processing

1. Validate bearer token
2. Governance check (`call_agent` tool for caller)
3. Callee allowlist check
4. Budget check (charged to **callee's** budget)
5. Load/create session for callee
6. Execute turn via callee's runner
7. Save session, record spend
8. Return output to caller

## Budget implications

Agent bus calls are charged to the **callee's** budget, not the caller's. This prevents a cheap agent from burning through an expensive agent's budget without that being visible in budget tracking.

## Security

- **Bearer token auth** — one-time UUID generated at startup, passed to containers via env vars
- **Localhost only** — bus HTTP server binds to `127.0.0.1`, never exposed
- **Circular call detection** — the SecurityAuditor flags `A → B → A` cycles in static analysis
- **Governance denial spike** — dynamic auditor tracks excessive `call_agent` denials
