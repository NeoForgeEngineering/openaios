---
title: Message Flow
description: How a message travels through openAIOS from user input to agent response.
sidebar:
  order: 2
---

Every message follows the same path through openAIOS. The router is a thin dispatcher — the runner owns the agent's config, session state, and execution.

![Message Flow](/openaios/message-flow.svg)

## Step by step

### 1. Inbound

A user sends a message via Telegram, Discord, or HTTP webhook. The channel adapter normalizes it into an `InboundMessage`:

```typescript
interface InboundMessage {
  text: string;
  userId: string;
  messageId?: string;
  channelType: string;
}
```

### 2. Routing

`RouterCore.handle()` receives the message and identifies the target agent based on which channel adapter delivered it.

### 3. Pre-flight

Before executing the turn, the router does two things:

1. **Budget check** — `BudgetManager.check(agentName)` verifies spending is within limits. If exceeded:
   - `block` — reject the message
   - `downgrade` — set `modelOverride` to a cheaper model
   - `warn` — log a warning and proceed
2. **Build sessionKey** — `{channelType}:{userId}` (e.g. `telegram:12345678`)

### 4. Execute turn

The router calls the runner with a minimal input:

```typescript
runner.run({
  sessionKey: "telegram:12345678",
  message: "What is 2 + 2?",
  modelOverride: undefined,  // or cheaper model from budget downgrade
});
```

The **runner owns everything else**: system prompt, tools, model, workspace, and session continuity. It resolves the workspace directory (`workspacesDir/sessions/{sessionKey}/`), loads any existing session state, executes the LLM call, and returns:

```typescript
interface RunResult {
  output: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  model: string;
}
```

### 5. Post-turn

After the runner returns, the router:

1. **Records cost** — `SessionStore` tracks cumulative `totalCostUsd` per agent/user pair
2. **Reports to governance** — `GovernanceAdapter.reportTurnCost()` (fire-and-forget)

### 6. Response

The output is sent back through the channel adapter to the user.

## Error handling

- **Budget exceeded (block)** — returns a friendly "budget exceeded" message to the user
- **Runner failure** — logs the error, returns an error message to the user
- **Session not found** — runner creates a new session (first message)

## What the runner owns

| Concern | How |
|---------|-----|
| System prompt | Set via `AgentConfig.systemPrompt` at startup |
| Allowed/denied tools | Set via `AgentConfig.allowedTools/deniedTools` |
| Model selection | `AgentConfig.defaultModel`, overridden by `modelOverride` from budget |
| Session continuity | Claude Code: `--resume`; Ollama/OpenAI: in-memory history |
| Workspace | `workspacesDir/sessions/{sessionKey}/` directory |
| Shared memory | `AgentConfig.memoryDir` injected into system prompt |

## Hot-reload

When the dashboard or TUI updates an agent's config, `runner.reconfigure(newConfig)` is called. The runner updates its internal state (prompt, tools, model) without losing active sessions.
