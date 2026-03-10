---
title: System Design
description: How openAIOS is architected — agent autonomy, interfaces, and the runtime lifecycle.
sidebar:
  order: 1
---

openAIOS is a pnpm monorepo built around the principle of **agent autonomy** — runners are self-contained units that own their config, session state, and workspace. The router is a thin mailroom dispatcher.

![Architecture Overview](/openaios/architecture.svg)

## Agent autonomy model

The core insight: agents are autonomous employees configured once, not stateless workers micromanaged per turn.

| Concern | Who owns it |
|---------|-------------|
| System prompt, tools, model | **Runner** (via `AgentConfig` at startup) |
| Session continuity | **Runner** (internal `sessions/` directory) |
| Workspace | **Runner** (`workspacesDir/sessions/{sessionKey}/`) |
| Message routing | Router (thin dispatcher) |
| Cost tracking | Router + SessionStore |
| Budget enforcement | Router + BudgetManager |
| Policy checks | AgentBus + GovernanceAdapter |

### RunInput is minimal

Each turn, the router passes only:

```typescript
interface RunInput {
  sessionKey: string;        // e.g. "telegram:12345678"
  message: string;
  modelOverride?: string;    // budget downgrade signal
}
```

The runner already knows its system prompt, tools, workspace, and model from the `AgentConfig` it received at startup.

### AgentConfig (set once)

```typescript
interface AgentConfig {
  agentName: string;
  systemPrompt: string;      // resolved: persona + skills + memory path
  defaultModel: string;
  premiumModel?: string;
  allowedTools: string[];
  deniedTools: string[];
  workspacesDir: string;
  memoryDir: string;
}
```

### Hot-reload without restart

When config changes (via dashboard, TUI, or governance), the runner's `reconfigure(config)` method updates the `AgentConfig` in place. Active sessions are preserved — only the prompt, tools, or model change.

![Hot-Reload Flow](/openaios/hot-reload.svg)

## Core interfaces

### RunnerAdapter

Executes turns and owns session state.

```typescript
interface RunnerAdapter {
  run(input: RunInput): Promise<RunResult>;
  runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult>;
  reconfigure(config: AgentConfig): void;  // hot-reload
  supportsSessionResume: boolean;
  healthCheck(): Promise<boolean>;
  env: RunnerEnv;  // 'native' | 'docker'
}
```

**Implementations:** ClaudeCodeRunner (native), DockerRunner (docker exec). The `runner.llm` field selects the LLM engine; the `runner.env` field selects where execution happens.

### GovernanceAdapter

Enforces policies on tool use and reports telemetry.

```typescript
interface GovernanceAdapter {
  checkPolicy(req: PolicyRequest): Promise<PolicyDecision>;
  reportToolUse(event: ToolUseEvent): void;
  reportTurnCost(event: TurnCostEvent): void;
}
```

**Implementations:** LocalGovernance (in-process deny-by-default), BRGovernance (external API)

### ChannelAdapter

Connects any messaging platform.

```typescript
interface ChannelAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(target: ChannelTarget, msg: OutboundMessage): Promise<void>;
  onMessage(handler: MessageHandler): void;
  readonly channelType: string;
}
```

**Implementations:** TelegramAdapter, WebhookAdapter, DiscordAdapter (stub)

### SessionStore

Tracks cumulative cost per agent/user pair. Session continuity is owned by the runner.

```typescript
interface SessionStore {
  get(key: SessionKey): Promise<Session | undefined>;
  set(session: Session): Promise<void>;
  delete(key: SessionKey): Promise<void>;
  listByAgent(agentName: string): Promise<Session[]>;
  listAll(): Promise<Session[]>;
}

interface Session {
  agentName: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  totalCostUsd: number;   // cumulative cost only
}
```

## Startup sequence

When `openaios start` runs:

1. Load and validate `openAIOS.yml` via Zod
2. Initialize SessionStore, BudgetManager, GovernanceAdapter
3. Ensure memory directory exists
4. Start HTTP server (dashboard + webhook routes)
5. Start bus HTTP server (localhost, one-time token)
6. If docker agents: create ContainerOrchestrator + CapabilityProvisioner
7. For each docker agent: `ensureRunning()`, provision sidecars
8. **For each agent: build `AgentConfig`** (resolve persona + skills + memory path + tools)
9. **For each agent: create runner with `AgentConfig`** — runner owns everything from here
10. Register runners on AgentBus
11. Create channel adapters, register routes on RouterCore
12. Wire DashboardServer routes (including hot-reload PATCH API)
13. Start channels (Telegram polling, Webhook listening)
14. Run SecurityAuditor (initial + every 30 minutes)
15. On SIGINT/SIGTERM: graceful shutdown

## Federation (BR Platform)

When running under [Bot Resources](https://botresources.com) governance with `federation` configured, the `FederatedAgentBus` wraps the local `AgentBus` and routes calls to agents hosted on other BR-managed nodes.

![Federation](/openaios/federation.svg)

Key behaviors:
- Requires BR governance (`governance.br` must be configured)
- Session keys qualified with `nodeId` to prevent collisions
- Cross-node calls use `POST /internal/bus/message` with peer bearer token
- Bus HTTP server accepts both local `busToken` and peer `inbound_token`

## Monitoring

- **Web Dashboard** at `http://localhost:{port}` — dark-themed, real-time, with Configure tab
- **Terminal UI** via `openaios tui` — Ink-based with Status/Logs/Configure tabs
- **SSE stream** at `/api/events` — live structured log streaming
- **REST API** — `/api/status`, `/api/sessions`, `/api/budget`, `/api/logs`, `/api/audit`, `/api/config`, `/api/skills`
- **Structured logging** — TTY-formatted in dev, JSON in production (systemd)
- **Security Auditor** — static + dynamic checks every 30 minutes
