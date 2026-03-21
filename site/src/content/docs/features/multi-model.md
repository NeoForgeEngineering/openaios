---
title: Multi-Model Runners
description: Model catalog, API key rotation, reasoning modes, and direct SDK runners.
sidebar:
  order: 8
---

The `@openaios/runner` package supports **multiple LLM providers**, API key rotation for high availability, reasoning modes, and direct SDK runners.

## Model Catalog

Discover available models from configured providers:

```typescript
const catalog = new ModelCatalog()
const models = await catalog.discover('ollama')
// [{ id: 'qwen2.5:7b', provider: 'ollama', name: 'qwen2.5:7b' }, ...]
```

### Supported providers

| Provider | Discovery | Notes |
|----------|----------|-------|
| `anthropic` | Static list | Claude Opus 4, Sonnet 4, Haiku 4 |
| `openai` | `/v1/models` API | Requires API key |
| `ollama` | `/api/tags` | Local, no key needed |
| `openrouter` | `/v1/models` API | Requires API key |
| `groq` | `/v1/models` API | Requires API key |

## API Key Rotation

Round-robin across multiple API keys with automatic cooldown on 429 rate limits:

```yaml
agents:
  - name: assistant
    model:
      default: claude-sonnet-4-20250514
      auth_profiles:
        - key: ${ANTHROPIC_KEY_1}
        - key: ${ANTHROPIC_KEY_2}
        - key: ${ANTHROPIC_KEY_3}
```

When a key hits a 429, it's cooled down for 60 seconds while the next key takes over. If all keys are on cooldown, the least-recently limited key is used.

## Reasoning Modes

Control how much "thinking" an agent does per turn:

```yaml
agents:
  - name: analyst
    model:
      default: claude-sonnet-4-20250514
      premium: claude-opus-4-20250514
      reasoning: deep           # standard | fast | deep
```

| Mode | Behavior |
|------|----------|
| `standard` | Default thinking budget |
| `fast` | Thinking disabled (`--thinking-budget 0`) |
| `deep` | Extended thinking (`--thinking-budget 32000`), auto-selects premium model |

## Direct SDK Runners

For agents that don't need Claude Code's tool execution, use direct API runners:

### Anthropic SDK Runner

Calls the Anthropic Messages API directly with conversation history:

```typescript
const runner = new AnthropicSdkRunner(agentConfig, {
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxTokens: 4096,
})
```

### OpenAI SDK Runner

Calls any OpenAI-compatible Chat Completions endpoint:

```typescript
const runner = new OpenAiSdkRunner(agentConfig, {
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: 'https://api.openai.com/v1',  // or Azure, Groq, etc.
})
```

Both maintain per-session conversation history and support model override for budget downgrades.

## Runner Matrix

| env | llm | Runner | Use case |
|-----|-----|--------|----------|
| `native` | `claude-code` | ClaudeCodeRunner | Full agent with tools + filesystem |
| `docker` | `claude-code` | DockerRunner | Isolated agent in container |
| `external` | any | ExternalAgentRunner | Delegate to OpenAI-compat endpoint |
| `native` | direct | AnthropicSdkRunner | Simple chat agent, Anthropic API |
| `native` | direct | OpenAiSdkRunner | Simple chat agent, OpenAI API |
