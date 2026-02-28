# openAIOS Architecture

## Overview

openAIOS is a model-agnostic AI agent runtime. It connects messaging channels (Telegram, Discord, Webhook) to AI runners (Claude Code, Ollama, OpenAI-compatible APIs) via a typed interface layer with built-in governance, budget tracking, and session management.

## Package Dependency Graph

```
core
 ├── runner        (ClaudeCodeRunner, OllamaRunner, OpenAICompatRunner)
 ├── budget        (SQLite BudgetManager)
 ├── br-sdk        (Bot Resources API client)
 │    └── br-hook  (Claude Code hook scripts)
 └── governance    (LocalGovernance, BRGovernance)
      └── router   (RouterCore, SessionManager)
           └── channels  (TelegramAdapter, DiscordAdapter, WebhookAdapter)
                └── cli  (openaios init/start/status)
```

Turbo enforces this dependency order — packages only build after their dependencies.

## Core Interfaces

All extensibility points are defined in `@openaios/core` as TypeScript interfaces:

| Interface | Purpose |
|---|---|
| `RunnerAdapter` | Execute agent turns (Claude Code, Ollama, etc.) |
| `GovernanceAdapter` | Policy checks + audit reporting |
| `ChannelAdapter` | Send/receive messages on a channel |
| `SessionStore` | Persist session state across turns |

## Message Flow

```
Telegram/Discord/Webhook
         ↓ InboundMessage
  ChannelAdapter.onMessage()
         ↓
    RouterCore
    ├── SessionStore.get()       → load session (claudeSessionId for --resume)
    ├── BudgetManager.check()    → may downgrade model
    ├── GovernanceAdapter (policy check — currently in ClaudeCode runner)
    ├── RunnerAdapter.run()      → execute turn
    ├── SessionStore.set()       → persist updated session
    ├── BudgetManager.record()   → record cost
    └── GovernanceAdapter.reportTurnCost()  (fire-and-forget)
         ↓ RunResult.output
  ChannelAdapter.send()
         ↓
Telegram/Discord/Webhook
```

## Security Model

### Deny-by-default permissions

Agents must explicitly list allowed tools in `permissions.allow`. An empty allow list blocks all tools.

```yaml
permissions:
  allow: [Read, Glob]   # Only these tools permitted
  deny: [Bash]          # Explicit deny — takes precedence over allow
```

### `--` separator

The `ClaudeCodeRunner` always passes `--` before user input to the Claude CLI, preventing user-supplied content from being interpreted as CLI flags.

### Input validation

- Agent names: `/^[a-z0-9-]+$/`
- Session/user IDs: `/^[a-zA-Z0-9:_-]+$/`
- Message size: 16KB maximum

### Runner isolation

Agents run as the `aios` system user. Each agent gets an isolated workspace directory (`/home/aios/workspaces/<agent-name>/`). The governance layer (LocalGovernance or BRGovernance) is the primary access control mechanism.

Future: `runner.mode: docker` will spawn each agent turn in a throwaway container for stronger isolation.

## Session Continuity

Claude Code supports `--resume <session-id>` to continue a conversation. openAIOS stores the `claudeSessionId` returned by each turn in the `SessionStore` and passes it as `claudeSessionId` on the next turn.

Ollama and OpenAI-compatible runners maintain conversation history in-memory (keyed by session key). This history is lost on restart. A future enhancement will persist this history to SQLite.

## Budget System

The `BudgetManager` (SQLite-backed) records cost per agent per period. Before each turn:

1. `budget.check()` is called
2. If exceeded: block, downgrade model, or just warn (per config)
3. After turn: `budget.record()` persists the cost

Budget periods: `daily | weekly | monthly`.
