# openAIOS

Model-agnostic AI agent orchestration OS. Connect any AI model (Claude, Ollama, OpenAI-compatible) to any channel (Telegram, Discord, Webhook) with built-in governance, budget tracking, session management, and a governed inter-agent bus.

## What it does

- **Channel → Agent → Channel**: messages arrive via Telegram/Discord/Webhook, get processed by an AI runner, responses are sent back
- **Long-lived Docker containers**: agents run in persistent containers (`docker exec` per turn), not ephemeral processes
- **Agent bus**: governed request/response between agents — Agent A can call Agent B within policy bounds
- **Budget tracking**: per-agent spending limits with block/downgrade/warn actions
- **Deny-by-default permissions**: agents only get the tools you explicitly allow

## Quickstart (local, no Telegram token needed)

Requires: Node 22+, pnpm, Ollama with a model pulled.

```bash
# 1. Clone and install
git clone https://github.com/NeoForgeEngineering/openaios
cd openaios
pnpm install && pnpm build

# 2. Create config
cat > openAIOS.yml << 'EOF'
agents:
  - name: assistant
    persona: "You are a helpful assistant."
    model:
      default: ollama/qwen2.5-coder:7b
    channels:
      webhook:
        path: /webhook
    permissions:
      allow: [Read, Glob, Grep]
      deny: []
    runner:
      mode: native
    capabilities:
      browser: false
      agent-calls: []

models:
  providers:
    ollama:
      base_url: "http://localhost:11434"

network:
  bind: localhost
  port: 3000

data:
  dir: ./data
EOF

# 3. Start
node packages/cli/dist/bin/openaios.js start

# 4. Send a message
curl -s -X POST http://localhost:3000/webhook \
  -H 'Content-Type: application/json' \
  -d '{"text": "What is 2 + 2?", "userId": "me"}'
# → {"output":"4","messageId":"..."}
```

> **Note:** `better-sqlite3` is a native module. If you're on a new Node version and see a binding error, run:
> ```bash
> cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npx node-gyp rebuild
> ```

## Channels

| Channel | Config key | Status |
|---|---|---|
| Webhook (HTTP POST) | `channels.webhook` | Implemented — local dev friendly |
| Telegram | `channels.telegram` | Implemented — requires bot token |
| Discord | `channels.discord` | Stub — coming soon |

### Webhook request/response format

```bash
# Send
curl -X POST http://localhost:{port}{path} \
  -H 'Content-Type: application/json' \
  [-H 'X-Webhook-Secret: {secret}'] \
  -d '{"text": "...", "userId": "optional", "messageId": "optional"}'

# Response (synchronous — holds open until agent replies)
{"output": "...", "messageId": "..."}
```

### Telegram

```yaml
channels:
  telegram:
    token: ${TELEGRAM_TOKEN}
```

## Runner modes

### `native` (default)

Spawns a new process per turn on the host. Requires `claude` CLI in PATH or configured `bin`.

```yaml
runner:
  mode: native
```

### `docker`

Runs each agent in a long-lived container. Turns execute via `docker exec` — persistent workspace, memory/CPU limits, no per-turn container overhead.

```yaml
runner:
  mode: docker
  docker:
    image: openaios/agent:latest
    memory: 1g
    cpus: 1
```

### Other runners

Prefix the model name to select the runner automatically:

| Model prefix | Runner |
|---|---|
| `claude-code` | Claude Code CLI (local) |
| `ollama/...` | Ollama local API |
| `openai/...` | OpenAI-compatible API |

## Configuration reference

See [`openAIOS.yml.example`](./openAIOS.yml.example) for a fully-annotated config file.

Key sections:

```yaml
agents:           # One or more agents with channels, model, permissions, runner
models.providers: # ollama, anthropic, groq, openrouter, claude-code
budget:           # Per-agent spending limits (daily/weekly/monthly)
governance:       # Optional: BR governance API for external policy enforcement
network:          # bind address, HTTP port, bus port
data:             # Runtime data directory (sessions, SQLite)
```

## Agent bus (multi-agent)

Agents can call other agents via the `call_agent` tool (inside Docker containers) or the internal bus HTTP API:

```yaml
# Agent A can call Agent B
capabilities:
  agent-calls: [agent-b]
```

Two authorization layers must both pass:
1. `call_agent` in `permissions.allow` (auto-added when `agent-calls` is non-empty)
2. The callee must be in `agent-calls`

## CLI

```bash
openaios start             # Start the runtime (reads openAIOS.yml)
openaios start -c path.yml # Custom config path
openaios status            # Show runner health, session counts, budget
openaios init              # Scaffold an openAIOS.yml in the current directory
```

## Development

```bash
pnpm install        # Install dependencies
pnpm build          # Build all packages
pnpm typecheck      # TypeScript check all packages
pnpm test           # Run tests (router package)
```

### Package structure

```
packages/
├── core/       — schemas (zod), interfaces, config loader
├── runner/     — ClaudeCodeRunner, OllamaRunner, OpenAICompatRunner, DockerRunner
├── budget/     — SQLite BudgetManager
├── governance/ — LocalGovernance, BRGovernance
├── router/     — RouterCore, AgentBus, SessionStore
├── channels/   — TelegramAdapter, WebhookAdapter, DiscordAdapter
├── cli/        — openaios start/status/init
├── br-sdk/     — Bot Resources API client
├── br-hook/    — Claude Code hook scripts
└── images/
    └── agent/  — Docker image (node:22 + claude CLI + call_agent)
```

## Docs

- [Architecture](./docs/architecture.md) — system design, message flows, container networking
- [Security](./docs/security.md) — threat model, controls, hardening checklist
- [Deployment](./docs/deployment.md) — production setup on forge-smith (systemd + Tailscale)

## License

AGPL-3.0 with a commercial exception. See [`COMMERCIAL_LICENSE.md`](./COMMERCIAL_LICENSE.md) for commercial use terms.
