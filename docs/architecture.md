# openAIOS Architecture

## Overview

openAIOS is a model-agnostic AI agent orchestration OS. It connects messaging channels (Telegram, Discord, Webhook) to AI runners (Claude Code, Ollama, OpenAI-compatible APIs) via a typed interface layer with built-in governance, budget tracking, session management, long-lived container isolation, and a governed inter-agent bus.

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
                └── cli  (openaios init/start/status)

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

## Channel Notes

### WebhookAdapter

The webhook channel uses a **synchronous request/response** pattern: the HTTP POST is held open until the agent calls `send()`, at which point the response is returned in the HTTP body. This makes `curl` a first-class client for local development without any third-party bot token.

Multiple agents can share the same HTTP server (`config.network.port`) by registering different paths (`/webhook`, `/webhook/agent-b`, etc.). The server is started only if at least one agent has `channels.webhook` configured.

```bash
# Local test — no Telegram account required
curl -X POST http://localhost:3000/webhook \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "userId": "me"}'
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
- Isolated workspace via named volume (`openaios-{name}-workspace`)
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
  3. If any webhook agents: start shared HTTP server on config.network.port
  4. Start bus HTTP server (127.0.0.1:{random_port}, one-time token)
  5. If any docker agents: create ContainerOrchestrator + CapabilityProvisioner
  6. For each docker agent: ensureRunning() → docker run (if not already up)
  7. For each docker agent: provision() → start browser sidecar if needed
  8. For each agent: register on AgentBus
  9. For each agent channel: create adapter, push AgentRoute
 10. RouterCore.start() → all channels begin polling/listening
 11. On SIGINT/SIGTERM: stop channels → close bus/HTTP servers → deprovision sidecars → stop containers
```
