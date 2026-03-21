---
title: Interfaces
description: Core TypeScript interfaces for extending openAIOS with custom runners, channels, and governance.
sidebar:
  order: 3
---

openAIOS is built on core interfaces in `@openaios/core`. Implement any of them to extend the system with custom backends.

## RunnerAdapter

Autonomous agent executor. Receives `AgentConfig` once at startup and owns session continuity.

```typescript
interface RunnerAdapter {
  /** Execute a single turn — runner owns prompt, tools, session state */
  run(input: RunInput): Promise<RunResult>;

  /** Execute a turn with streaming chunks */
  runStreaming(input: RunInput): AsyncGenerator<StreamChunk, RunResult>;

  /** Hot-reload config without losing sessions */
  reconfigure(config: AgentConfig): void;

  /** Whether this runner supports session resume */
  supportsSessionResume: boolean;

  /** Check if the runner backend is reachable */
  healthCheck(): Promise<boolean>;

  /** Runner execution environment */
  env: RunnerEnv;  // 'native' | 'docker'
}
```

### AgentConfig (set once at startup)

```typescript
interface AgentConfig {
  agentName: string;
  systemPrompt: string;      // fully resolved: persona + skills + memory
  defaultModel: string;
  premiumModel?: string;
  allowedTools: string[];
  deniedTools: string[];
  workspacesDir: string;     // runner creates sessions/{sessionKey}/ within
  memoryDir: string;
}
```

### RunInput (minimal per-turn)

```typescript
interface RunInput {
  sessionKey: string;        // e.g. "telegram:12345678"
  message: string;
  modelOverride?: string;    // budget downgrade signal from router
}
```

### RunResult

```typescript
interface RunResult {
  output: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  model: string;
}

interface StreamChunk {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'cost' | 'error';
  text?: string;
  data?: unknown;
}
```

**Built-in implementations:**
- `ClaudeCodeRunner` — spawns `claude` CLI on the host (`env: native`), uses `--resume` for session continuity
- `DockerRunner` — `docker exec` into long-lived containers (`env: docker`)

The LLM engine is selected via `runner.llm` (claude-code, openai-compat, gemini, ollama). Non-claude-code engines set `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` environment variables, routing through an Anthropic-compatible gateway.

## GovernanceAdapter

Enforce policies on agent behavior.

```typescript
interface GovernanceAdapter {
  /** Check if a tool use is allowed (must resolve within 200ms) */
  checkPolicy(req: PolicyRequest): Promise<PolicyDecision>;

  /** Fire-and-forget: report a tool use event for audit */
  reportToolUse(event: ToolUseEvent): void;

  /** Fire-and-forget: report turn cost for budget reconciliation */
  reportTurnCost(event: TurnCostEvent): void;
}

interface PolicyRequest {
  agentName: string;
  sessionKey: string;
  tool: string;
  input: Record<string, unknown>;
}

type PolicyDecision =
  | { allowed: true; reason?: string }
  | { allowed: false; reason: string };

interface ToolUseEvent {
  agentName: string;
  sessionKey: string;
  tool: string;
  input: Record<string, unknown>;
  decision: PolicyDecision;
  timestampMs: number;
}

interface TurnCostEvent {
  agentName: string;
  sessionKey: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
  timestampMs: number;
}
```

**Built-in implementations:**
- `LocalGovernance` — in-process deny-by-default using `permissions.allow`/`deny`
- `BRGovernance` — external Bot Resources API (200ms timeout, fail-open by default)
- `createGovernance()` factory — composes Local + BR when both are configured (local deny short-circuits)

## ChannelAdapter

Connect any messaging platform.

```typescript
interface ChannelAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(target: ChannelTarget, msg: OutboundMessage): Promise<void>;
  onMessage(handler: MessageHandler): void;
  readonly channelType: string;
}
```

**Built-in implementations:**
- `TelegramAdapter` — long-polling Telegram Bot API
- `WebhookAdapter` — synchronous HTTP POST request/response
- `DiscordAdapter` — stub (coming soon)

## SessionStore

Tracks cumulative cost per agent/user pair. Session continuity is owned by the runner, not the store.

```typescript
interface SessionStore {
  get(key: SessionKey): Promise<Session | undefined>;
  set(session: Session): Promise<void>;
  delete(key: SessionKey): Promise<void>;
  listByAgent(agentName: string): Promise<Session[]>;
  listAll(): Promise<Session[]>;
}

interface SessionKey {
  agentName: string;
  userId: string;
}

interface Session {
  agentName: string;
  userId: string;       // channel-scoped, e.g. "telegram:12345678"
  createdAt: number;
  updatedAt: number;
  totalCostUsd: number; // cumulative — this is all the store tracks
}
```

**Built-in implementations:**
- `SQLiteSessionStore` — persistent storage using better-sqlite3

## AgentBus

Governed inter-agent communication. The core interface is minimal — the concrete `AgentBus` class adds `register()`.

```typescript
// Core interface (in @openaios/core)
interface AgentBus {
  request(req: AgentBusRequest): Promise<AgentBusResponse>;
}

interface AgentBusRequest {
  fromAgent: string;
  toAgent: string;
  message: string;
  callerSessionKey: string;
  inboundPeer?: string;     // set by HTTP handler for federated peer requests
}

interface AgentBusResponse {
  output: string;
  costUsd?: number;
}

// Concrete class (in @openaios/router)
class AgentBus implements AgentBusInterface {
  register(agentName: string, entry: AgentBusEntry): void;
  request(req: AgentBusRequest): Promise<AgentBusResponse>;
}

interface AgentBusEntry {
  runner: RunnerAdapter;
  defaultModel: string;
  allowedCallees: string[];   // from capabilities['agent-calls']
}
```

**Two-layer governance:**
1. `GovernanceAdapter.checkPolicy` — treats `call_agent` as a regular tool
2. `allowedCallees` — explicit callee allowlist (skipped for federated peer requests)

## ToolDefinition

Interface for registering tools into the `@openaios/tools` ToolRegistry.

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  sessionKey: string;
  agentName: string;
  workspaceDir: string;
}

interface ToolResult {
  type: 'text' | 'json' | 'image' | 'error';
  content: string | Record<string, unknown>;
}
```

Every tool execution passes through governance (`checkPolicy`) before running.

## MemoryAdapter

Interface for semantic memory storage. Implemented by `MemoryStore` in `@openaios/memory`.

```typescript
interface MemoryEntry {
  key: string;
  content: string;
  metadata?: Record<string, unknown>;
  score?: number;
  createdAt: string;   // ISO 8601
  updatedAt: string;
}

interface MemoryAdapter {
  store(agentName: string, key: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
  search(agentName: string, query: string, opts?: { topK?: number; minScore?: number }): Promise<MemoryEntry[]>;
  get(agentName: string, key: string): Promise<MemoryEntry | undefined>;
  delete(agentName: string, key: string): Promise<void>;
  buildPromptContext(agentName: string, query: string, maxTokens: number): Promise<string>;
  close(): void;
}
```

Memories are scoped by `agentName` — per-agent isolation enforced at query level.

## RouterEvent

Emitted by `RouterCore.events` for real-time monitoring via the WS Gateway.

```typescript
type RouterEvent =
  | { type: 'turn:start'; agentName: string; userId: string; timestampMs: number }
  | { type: 'turn:complete'; agentName: string; userId: string; output: string; costUsd?: number; model: string; timestampMs: number }
  | { type: 'turn:error'; agentName: string; userId: string; error: string; timestampMs: number }
```
