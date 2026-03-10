---
title: Configuration
description: Complete reference for openAIOS.yml configuration options.
sidebar:
  order: 3
---

openAIOS is configured through a single `openAIOS.yml` file validated by Zod schemas at startup. All `${ENV_VAR}` references are resolved from the environment.

:::caution
Never commit `openAIOS.yml` — it may contain secrets via env var references. Use `.env` files with `chmod 600` for credentials.
:::

## Full annotated example

```yaml
# openAIOS.yml
agents:
  - name: assistant
    # Inline string or path to a markdown file
    persona: "You are a helpful assistant. Be concise and accurate."
    # persona: ./agents/assistant.md

    model:
      default: ollama/qwen2.5:7b      # Primary model
      premium: claude-code             # Escalation model (future)

    channels:
      telegram:
        token: ${TELEGRAM_TOKEN}
      # discord:
      #   token: ${DISCORD_TOKEN}
      #   guildId: "optional-guild-id"
      webhook:
        path: /webhook                 # HTTP POST endpoint
        secret: ${WEBHOOK_SECRET}      # Optional HMAC verification

    permissions:
      allow:
        - Read
        - Write
        - Glob
        - Grep
      deny:
        - Bash          # Explicit deny overrides allow
        - WebSearch

    runner:
      env: docker                    # docker | native (default: docker)
      llm: claude-code               # claude-code | openai-compat | gemini | ollama
      # llm_config:                  # required when llm !== 'claude-code'
      #   base_url: http://localhost:4000  # Anthropic-compat gateway
      #   api_key: ${GATEWAY_API_KEY}
      # native:                      # required when env: native
      #   allow_host_access: true    # explicit opt-in for host access
      docker:
        image: openaios/agent:latest
        memory: 1g
        cpus: 1

    capabilities:
      browser: false          # Chromium sidecar (docker mode only)
      agent-calls: []         # Agent names this agent may call

    skills:                   # OpenClaw-compatible SKILL.md injection
      - web-search
      - summarizer

models:
  providers:
    ollama:
      base_url: "http://localhost:11434"
    # anthropic:
    #   api_key: ${ANTHROPIC_API_KEY}
    # groq:
    #   api_key: ${GROQ_API_KEY}
    # openrouter:
    #   api_key: ${OPENROUTER_API_KEY}
    claude-code:
      bin: claude             # Path to claude CLI binary

budget:
  period: monthly             # daily | weekly | monthly
  agents:
    assistant:
      limit: 10.00            # USD per period
      warning_at: 0.80        # Warn at 80%
      on_exceeded: downgrade  # block | downgrade | warn
      downgrade_to: ollama/qwen2.5:7b

# governance:
#   br:
#     url: ${BR_URL}
#     token: ${BR_TOKEN}
#     fail_secure: false      # true = block if BR unreachable

network:
  bind: tailscale             # tailscale | localhost | 0.0.0.0 | IP
  port: 3000
  # bus_port: 0               # 0 = random ephemeral port
  # tsdproxy: false           # register containers on Tailscale

data:
  dir: ./data                 # Sessions, SQLite, runtime data

memory:
  dir: ./data/memory          # Shared markdown memory for all agents

skills:
  dir: ~/.openclaw/skills     # Directory with SKILL.md subdirectories

# federation:                 # BR platform multi-node routing
#   node_id: us-east
#   inbound_token: ${PEER_INBOUND_TOKEN}
#   peers:
#     - node_id: eu-west
#       bus_url: ${EU_WEST_BUS_URL}
#       token: ${EU_WEST_TOKEN}
#       agents: [researcher]
```

## Sections

### `agents`

Array of agent definitions. Each agent must have at least one channel.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Unique agent identifier (alphanumeric + hyphens) |
| `persona` | string | yes | System prompt or path to `.md` file |
| `model.default` | string | yes | Primary model identifier |
| `model.premium` | string | no | Escalation model |
| `channels` | object | yes | At least one of: `telegram`, `discord`, `webhook` |
| `permissions.allow` | string[] | no | Tools the agent may use (empty = none) |
| `permissions.deny` | string[] | no | Explicit denials (overrides allow) |
| `runner.env` | `docker` \| `native` | no | Default: `docker` |
| `runner.llm` | `claude-code` \| `openai-compat` \| `gemini` \| `ollama` | no | Default: `claude-code` |
| `runner.llm_config` | object | when llm ≠ claude-code | Gateway config (`base_url`, `api_key?`) |
| `runner.native` | `{ allow_host_access: true }` | when env = native | Explicit opt-in for host access |
| `runner.docker` | object | no | Docker container config |
| `capabilities.browser` | boolean | no | Enable browser sidecar (docker only) |
| `capabilities.agent-calls` | string[] | no | Agents this agent may call |
| `skills` | string[] | no | Skill names to inject into system prompt |

### `models.providers`

Optional model provider configuration. Provider keys map to API credentials used by runners:

| Provider key | Purpose |
|-------------|---------|
| `ollama` | Ollama base URL (default: `http://localhost:11434`) |
| `claude-code` | Claude CLI binary path (default: `claude` on PATH) |
| `anthropic` | Anthropic API key + optional base URL |
| `groq` | Groq API key |
| `openrouter` | OpenRouter API key |
| `openai` | OpenAI API key + optional base URL |

The LLM engine is selected by `runner.llm`, not the model prefix. Non-`claude-code` engines use `runner.llm_config` to point at an Anthropic-compatible gateway.

### `budget`

Per-agent spending controls.

| Field | Type | Description |
|-------|------|-------------|
| `period` | `daily` \| `weekly` \| `monthly` | Budget reset period |
| `agents.<name>.limit` | number | USD limit per period |
| `agents.<name>.warning_at` | number (0-1) | Warning threshold (default: 0.8) |
| `agents.<name>.on_exceeded` | `block` \| `downgrade` \| `warn` | Action when exceeded |
| `agents.<name>.downgrade_to` | string | Model to downgrade to |

### `governance`

Optional external governance via Bot Resources API.

| Field | Type | Description |
|-------|------|-------------|
| `br.url` | string | BR API endpoint |
| `br.token` | string | BR API token |
| `br.fail_secure` | boolean | Block on BR failure (default: false = allow) |

### `network`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `bind` | string | `tailscale` | Bind address |
| `port` | number | `3000` | HTTP port for dashboard + webhooks |
| `bus_port` | number | `0` | Agent bus port (0 = random) |
| `tsdproxy` | boolean | `false` | Register Docker containers on Tailscale |

### `data`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dir` | string | `./data` | Runtime data directory |

### `memory`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dir` | string | `./data/memory` | Shared markdown memory directory |

### `skills`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dir` | string | `~/.openclaw/skills` | Directory containing skill subdirectories |

Each subdirectory should contain a `SKILL.md` file (OpenClaw-compatible format). Skills listed in an agent's `skills` array have their `SKILL.md` content injected into the system prompt.

### `federation`

Multi-node agent routing for the [Bot Resources](https://botresources.com) platform. Requires `governance.br` to be configured. When present, a `FederatedAgentBus` wraps the local bus and routes calls to agents on other BR-managed nodes.

| Field | Type | Description |
|-------|------|-------------|
| `node_id` | string | Unique identifier for this node |
| `inbound_token` | string | Token that peers must present when calling this node |
| `peers` | array | List of peer nodes |
| `peers[].node_id` | string | Peer's unique identifier |
| `peers[].bus_url` | string | Peer's bus HTTP URL (e.g. `http://100.x.x.x:4000`) |
| `peers[].token` | string | Token this node presents when calling the peer |
| `peers[].agents` | string[] | Agent names hosted on the peer |

## Environment variable resolution

Any `${VAR_NAME}` in string values is resolved from `process.env` at startup. Unresolved variables cause a startup error.

```yaml
# These are equivalent:
token: ${MY_TOKEN}
# resolves to the value of process.env.MY_TOKEN
```

Use a `.env` file (chmod 600) alongside your config for secrets.
