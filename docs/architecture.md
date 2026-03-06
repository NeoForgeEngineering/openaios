# openAIOS Architecture

## Overview

openAIOS is a model-agnostic AI agent orchestration OS. It connects messaging channels (Telegram, Discord, Webhook) to AI runners (Claude Code, Ollama, OpenAI-compatible APIs) via a typed interface layer with built-in governance, budget tracking, session management, long-lived container isolation, a governed inter-agent bus, structured logging, a web dashboard, and shared persistent memory.

## Package Dependency Graph

```
core
 ├── runner        (ClaudeCodeRunner, OllamaRunner, OpenAICompatRunner, DockerRunner)
 │    └── docker   (ContainerOrchestrator, CapabilityProvisioner)
 ├── budget        (SQLite BudgetManager)
 ├── br-sdk        (Bot Resources API client)
 │    └── br-hook  (Claude Code hook scripts)
 └── governance    (LocalGovernance, BRGovernance)
      └── router   (RouterCore, AgentBus, SessionStore)
           └── channels  (TelegramAdapter, DiscordAdapter, WebhookAdapter)
                └── cli  (openaios init/start/status/audit)
                     ├── dashboard/  (DashboardServer, HTML)
                     └── audit/      (SecurityAuditor)

images/
 └── agent         (Dockerfile: node:22 + claude CLI + call_agent tool)
```

Turbo enforces this dependency order — packages only build after their dependencies.

## Core Interfaces

All extensibility points are defined in `@openaios/core` as TypeScript interfaces:

| Interface | Purpose |
|---|---|
| `RunnerAdapter` | Execute agent turns (Claude Code, Ollama, Docker, etc.) |
| `GovernanceAdapter` | Policy checks + audit reporting |
| `ChannelAdapter` | Send/receive messages on a channel |
| `SessionStore` | Persist session state across turns |
| `AgentBus` | Governed request/response between agents |

## Runner Modes

### `native` (default)

The runner spawns a new process per turn directly on the host. Suitable for development and single-agent deployments.

```
openaios daemon
  └── spawn('claude', [...args]) — per turn
```

### `docker`

Each agent gets a **long-lived container** (`openaios-{name}`) that persists across turns. Turns are executed via `docker exec` — no per-turn container overhead, persistent workspace via named volume.

```
openaios daemon
  ├── ContainerOrchestrator
  │    └── docker run tail -f /dev/null   ← started once at startup
  └── per turn: docker exec openaios-{name} claude [args...]
```

Container config:

```yaml
runner:
  mode: docker
  docker:
    image: openaios/agent:latest
    memory: 1g
    cpus: 1
```

## Capabilities

Agents can declare capabilities that are provisioned as sidecars or injected environment:

```yaml
capabilities:
  browser: false          # true → Chromium CDP sidecar
  agent-calls: []         # list of agents this agent may call
```

### Browser capability

When `browser: true`, a `ghcr.io/zenika/alpine-chrome` container is started alongside the agent container on the `openaios` Docker network. The CDP endpoint is injected into the agent's `/workspace/.env.capabilities` as `CDP_URL=http://openaios-{name}-browser:9222`.

### Agent-calls capability

When `agent-calls: [other-agent]` is set, the `call_agent` tool is automatically added to the agent's allowed tools, and the agent may invoke `call_agent other-agent "message"` from inside the container. Requests are routed through the internal bus HTTP server.

## Shared Memory

All agents share a common memory directory of markdown files they read and write directly using their normal tools (`Read`, `Write`, `Grep`). There is no dedicated memory agent — just a shared filesystem path.

```yaml
memory:
  dir: ./data/memory   # default
```

### Native mode

Agents access `./data/memory/` directly via their file tools. openAIOS ensures the directory exists at startup and injects the path into each agent's system prompt:

```
Your shared memory directory is at ./data/memory.
Use Read/Write/Grep tools on .md files there to store and recall information across sessions.
```

### Docker mode

A shared named volume (`openaios-shared-memory`) is mounted at `/workspace/memory` in every agent container alongside the per-agent workspace:

```
openaios-{name}-workspace  →  /workspace          (private per agent)
openaios-shared-memory     →  /workspace/memory   (shared across all agents)
```

The volume is created idempotently at startup. `openaios init` scaffolds a starter `./data/memory/facts.md`.

## Channel Notes

### HTTP server

The HTTP server (`config.network.port`) **always starts**, regardless of whether any agent has a webhook channel. It serves:

- `GET /` — dashboard HTML
- `GET /api/*` — dashboard API (status, sessions, budget, logs, events, audit)
- Webhook agent paths (e.g. `/webhook`) — if configured

### WebhookAdapter

The webhook channel uses a **synchronous request/response** pattern: the HTTP POST is held open until the agent calls `send()`, at which point the response is returned in the HTTP body. This makes `curl` a first-class client for local development without any third-party bot token.

Multiple agents can share the same HTTP server by registering different paths (`/webhook`, `/webhook/agent-b`, etc.).

```bash
# Local test — no Telegram account required
curl -X POST http://localhost:3000/webhook \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "userId": "me"}'
```

## Web Dashboard

The dashboard is served at `http://localhost:{port}` (or the configured bind address). It is a single-page vanilla JS application — no build step required.

### Panels

| Panel | Description |
|---|---|
| Agents | Agent cards with model, session count, and budget progress bar |
| Live Logs | SSE stream from the logger ring buffer — real-time, last 200 lines |
| Sessions | All sessions across all agents (agent, userId, model, cost, last updated) |
| Security | Last audit result: passed/warned/errored check counts + finding details |

### API routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Dashboard HTML |
| `GET` | `/api/status` | Agent health, session counts, budget summary, uptime |
| `GET` | `/api/sessions` | All sessions across all agents |
| `GET` | `/api/budget` | Budget statuses for all agents |
| `GET` | `/api/logs` | Recent log entries (ring buffer) |
| `GET` | `/api/events` | SSE stream of new log entries |
| `GET` | `/api/audit` | Last security audit result |

### Live log stream

`GET /api/events` is an SSE endpoint. The client receives new log entries as they are emitted. The dashboard auto-reconnects on disconnect.

## Structured Logging

The `logger` singleton (`@openaios/core`) is used everywhere in place of `console.*`.

```typescript
import { logger } from '@openaios/core'

logger.info('[router]', 'message', { meta: 'data' })
logger.warn('[openaios]', 'warning message')
logger.error('[telegram]', 'error message', err)
```

**TTY output** (development):
```
2026-03-06 14:00:01 INFO  [router] Started 2 agent(s)
```

**Non-TTY output** (systemd/CI):
```json
{"ts":"2026-03-06T14:00:01.000Z","level":"info","tag":"[router]","msg":"Started 2 agent(s)"}
```

The ring buffer retains the last 500 entries, served by `/api/logs` and streamed by `/api/events`.

## Security Auditor

`SecurityAuditor` runs at startup and every 30 minutes. Findings are logged and available via `/api/audit`.

### Static checks (config-based)

| Code | Severity | Condition |
|---|---|---|
| `OVERLY_BROAD_PERMISSIONS` | WARN | Agent allows `Bash` or `*` with no deny list |
| `NO_BUDGET_LIMIT` | WARN | Agent has no entry in `budget.agents` |
| `WEBHOOK_NO_SECRET` | WARN | Webhook on non-localhost bind without `secret` |
| `AGENT_CALLS_LOCAL_ONLY` | WARN | `agent-calls` non-empty but governance is local-only |
| `CIRCULAR_AGENT_CALLS` | ERROR | Agent A can call B which can call A |

### Dynamic checks (runtime)

| Code | Severity | Condition |
|---|---|---|
| `SESSION_EXPLOSION` | WARN | Session count grew >50% since last audit |
| `DEAD_AGENT` | INFO | Agent has 0 sessions after >1h uptime |
| `GOVERNANCE_DENIAL_SPIKE` | WARN | >5 tool denials for an agent in the last hour |

### CLI

```bash
openaios audit          # print findings table, exit 1 if any ERROR
openaios audit -c path/to/openAIOS.yml
```

## Message Flow

### Channel → Agent (normal turn)

```
Telegram/Discord/Webhook
         ↓ InboundMessage
  ChannelAdapter.onMessage()
         ↓
    RouterCore
    ├── SessionStore.get()             → load session (claudeSessionId for --resume)
    ├── BudgetManager.check()          → may downgrade model
    ├── RunnerAdapter.run()            → execute turn
    │    └── (docker mode) docker exec openaios-{name} claude [args]
    ├── SessionStore.set()             → persist updated session
    ├── BudgetManager.record()         → record cost
    └── GovernanceAdapter.reportTurnCost() (fire-and-forget)
         ↓ RunResult.output
  ChannelAdapter.send()
         ↓
Telegram/Discord/Webhook
```

### Agent → Agent (bus call)

```
call_agent script (inside container)
         ↓ POST /internal/bus/message
         ↓ Authorization: Bearer {one-time token}
  BusHttpServer (127.0.0.1:{random_port})
         ↓
    AgentBus.request()
    ├── GovernanceAdapter.checkPolicy(tool: 'call_agent')
    ├── allowedCallees check
    ├── BudgetManager.check(toAgent)
    ├── SessionStore.get(toAgent, callerSession)
    ├── RunnerAdapter.run(toAgent)
    ├── SessionStore.set()
    └── BudgetManager.record(toAgent)
         ↓ AgentBusResponse { output }
  BusHttpServer
         ↓ JSON response
call_agent prints output to stdout
```

## Container Networking

All containers (agent + sidecars) share the `openaios` Docker bridge network:

```
openaios network (bridge)
 ├── openaios-{agent}          — agent container (claude CLI + call_agent)
 ├── openaios-{agent}-browser  — Chromium CDP (if capabilities.browser: true)
 └── host → 127.0.0.1:{port}  — bus HTTP server (not in Docker network)

Docker volumes
 ├── openaios-{agent}-workspace  — private per-agent workspace
 └── openaios-shared-memory      — shared memory across all agents
```

Containers communicate by container name (Docker DNS within the network). The bus server is on the host loopback and reached via `OPENAIOS_BUS_URL` injected at container start.

## Security Model

### Deny-by-default permissions

Agents must explicitly list allowed tools in `permissions.allow`. An empty allow list blocks all tools.

```yaml
permissions:
  allow: [Read, Glob]   # Only these tools permitted
  deny: [Bash]          # Explicit deny — takes precedence over allow
```

### Agent-to-agent governance

`call_agent` is treated as a regular tool by the governance layer. Two layers must both pass:

1. `GovernanceAdapter.checkPolicy({ tool: 'call_agent', input: { toAgent: '...' } })`
2. `AgentBus` checks `allowedCallees` — the callee must be explicitly listed in `capabilities['agent-calls']`

This means an agent cannot call another agent unless it is permitted both by governance policy AND by its own capability declaration.

### `--` separator

The `ClaudeCodeRunner` and `DockerRunner` always pass `--` before user input to the Claude CLI, preventing user-supplied content from being interpreted as CLI flags.

### Input validation

- Agent names: `/^[a-z0-9-]+$/`
- Session/user IDs: `/^[a-zA-Z0-9:_-]+$/`
- Message size: 16KB maximum

### Docker isolation

In `docker` mode, each agent runs inside its own container with:
- Configurable memory (`--memory`) and CPU (`--cpus`) limits
- Private workspace via named volume (`openaios-{name}-workspace`)
- Shared memory via named volume (`openaios-shared-memory`) at `/workspace/memory`
- No host filesystem access by default

## Session Continuity

Claude Code supports `--resume <session-id>` to continue a conversation. openAIOS stores the `claudeSessionId` returned by each turn in the `SessionStore` and passes it on the next turn.

In docker mode, the persistent container means the Claude session state (conversation history inside the process) survives across turns without needing `--resume`. However, `claudeSessionId` is still tracked for compatibility.

Ollama and OpenAI-compatible runners maintain conversation history in-memory (keyed by session key). This history is lost on restart.

## Budget System

The `BudgetManager` (SQLite-backed) records cost per agent per period. Before each turn:

1. `budget.check()` is called — may downgrade model or block
2. After turn: `budget.record()` persists the cost

Agent-to-agent bus calls are budgeted separately against the **callee** agent's budget limit. Budget periods: `daily | weekly | monthly`.

## Startup Sequence

```
openaios start
  1. Load config (openAIOS.yml)
  2. Init: SessionStore, BudgetManager, Governance
  3. Ensure memory dir exists (config.memory.dir)
  4. Start shared HTTP server on config.network.port (always)
  5. Start bus HTTP server (127.0.0.1:{random_port}, one-time token)
  6. If any docker agents: create ContainerOrchestrator + CapabilityProvisioner
  7. For each docker agent: ensureRunning() → docker run (if not already up)
  8. For each docker agent: provision() → start browser sidecar if needed
  9. For each agent: build system prompt (persona + memory dir suffix)
 10. For each agent: register on AgentBus
 11. For each agent channel: create adapter, push AgentRoute
 12. Wire DashboardServer routes onto HTTP server
 13. RouterCore.start() → all channels begin polling/listening
 14. SecurityAuditor.run() → initial audit (static + dynamic checks)
 15. Schedule SecurityAuditor every 30 minutes
 16. On SIGINT/SIGTERM: stop channels → close servers → deprovision sidecars → stop containers
```
