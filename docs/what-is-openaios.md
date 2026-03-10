# What is openAIOS?

openAIOS is a **model-agnostic, secure-by-default AI agent orchestration OS**. It connects any AI model to any messaging channel with built-in governance, budget enforcement, container isolation, and governed inter-agent communication.

Think of it as a production-grade runtime for deploying AI agents — not just a chat wrapper, but a full operating system layer that handles the hard parts: security, spending limits, multi-agent coordination, and deployment.

![Architecture Overview](./diagrams/architecture.svg)

## Core Concepts

### Channel → Agent → Channel

Messages arrive from any supported channel (Telegram, Discord, Webhook), get routed to the appropriate agent and runner, and responses flow back. openAIOS handles session persistence, so agents maintain conversation context across turns.

![Message Flow](./diagrams/message-flow.svg)

### Model-Agnostic Runners

openAIOS doesn't lock you into one model provider. Prefix the model name in your config and the right runner is selected automatically:

| Prefix | Runner | Use Case |
|--------|--------|----------|
| `claude-code` | Claude Code CLI | Full coding agent with tool use |
| `ollama/...` | Ollama | Local models, private data |
| `openai/...` | OpenAI-compatible | Groq, OpenRouter, Anthropic API |
| (docker mode) | DockerRunner | Isolated container execution |

### Deny-by-Default Security

Every agent starts with **zero permissions**. You explicitly allow each tool:

```yaml
permissions:
  allow: [Read, Glob, Grep, WebSearch]  # only these tools
  deny: [Bash, Write]                    # explicit denials override allow
```

### Budget Enforcement

Per-agent spending limits with automatic actions when exceeded:

```yaml
budget:
  period: monthly
  agents:
    assistant:
      limit: 10.00
      warning_at: 0.8
      on_exceeded: downgrade        # block | downgrade | warn
      downgrade_to: ollama/qwen2.5:7b
```

### Governed Agent Bus

Agents can call other agents through a two-layer authorization system. Both layers must pass:

1. `call_agent` must be in the agent's `permissions.allow`
2. The target agent must be in `capabilities.agent-calls`

![Agent Bus Flow](./diagrams/agent-bus.svg)

### Docker Container Isolation

In docker mode, each agent runs in a long-lived container with memory/CPU limits. Turns execute via `docker exec` — no per-turn container overhead, persistent workspace, and optional browser sidecar for web automation.

---

## openAIOS vs OpenClaw

Both projects solve the problem of connecting AI models to messaging platforms, but they take fundamentally different approaches.

![Comparison](./diagrams/comparison.svg)

### What They Share

- **Gateway pattern**: both act as a routing layer between channels and AI models
- **Channel support**: Telegram, Discord, and other messaging platforms
- **Local-first**: both can run entirely on your own hardware
- **Open source**: community-driven development

### Where They Diverge

#### 1. Agent Runtime

**OpenClaw** delegates all reasoning to the external [Pi agent framework](https://github.com/mariozechner/pi-agent-core). The gateway handles routing and orchestration, but the agent loop (tool calling, context management, LLM interaction) lives in a separate project.

**openAIOS** includes its own runner adapters as first-class components. Each runner (Claude Code, Ollama, OpenAI-compatible, Docker) is a built-in adapter implementing a shared interface. No external agent framework dependency.

#### 2. Configuration & Extensibility

**OpenClaw** uses `SKILL.md` files — markdown documents with YAML frontmatter that get injected into prompts at runtime. Skills are discovered dynamically and selectively injected per turn.

**openAIOS** uses a single `openAIOS.yml` config file validated by Zod schemas at startup. Everything is declared upfront: agents, channels, permissions, budgets, capabilities. Invalid configs fail fast with clear error messages.

#### 3. Security & Governance

**OpenClaw** focuses on the gateway problem and leaves security to the user and the underlying agent framework. There is no built-in permission system or spending controls.

**openAIOS** is secure-by-default:
- **Deny-by-default permissions** — agents get zero tools unless explicitly allowed
- **Budget enforcement** — per-agent spending limits with block/downgrade/warn
- **Two-layer agent bus auth** — governance check + callee allowlist
- **Security auditor** — automated static + dynamic checks every 30 minutes
- **CLI flag injection prevention** — `spawn()` with `--` separator
- **Input validation** — agent names, session IDs, message size limits (16KB)

#### 4. Multi-Agent Communication

**OpenClaw** does not have a built-in mechanism for agents to call other agents. Multi-agent workflows rely on external orchestration.

**openAIOS** has a governed `AgentBus` with:
- Governed request/response between agents
- Budget charged to the callee
- Circular call detection in the security auditor
- Docker-native: `call_agent` bash tool uses the bus HTTP API

#### 5. Container Isolation

**OpenClaw** runs agents as processes within the gateway. Isolation is process-level.

**openAIOS** supports full Docker isolation:
- Long-lived containers with `docker exec` per turn
- Memory/CPU limits per agent
- Private workspace volumes
- Optional browser sidecar (Playwright)
- Agent-to-agent calls via bearer-token-authenticated HTTP

#### 6. Protocol

**OpenClaw** uses a WebSocket server (port 18789) as its control plane, with an OpenAI-compatible HTTP API.

**openAIOS** uses HTTP throughout: REST API for webhooks and dashboard, SSE for live log streaming, and internal HTTP for the agent bus.

### When to Choose What

| You want... | Choose |
|-------------|--------|
| Quick personal assistant with many community skills | OpenClaw |
| Production deployment with security & budget controls | openAIOS |
| Existing Pi framework integration | OpenClaw |
| Model-agnostic setup (Claude + Ollama + OpenAI) | openAIOS |
| Governed multi-agent workflows | openAIOS |
| Large plugin/skill ecosystem | OpenClaw |
| Docker-isolated agents | openAIOS |
| WebSocket-based control plane | OpenClaw |

---

## Architecture Deep Dive

### Package Structure

```
packages/
├── core/       — Zod schemas, TypeScript interfaces, config loader, logger
├── runner/     — ClaudeCodeRunner, OllamaRunner, OpenAICompatRunner, DockerRunner
├── budget/     — SQLite-backed BudgetManager
├── governance/ — LocalGovernance (in-process), BRGovernance (external API)
├── router/     — RouterCore, AgentBus, SessionStore
├── channels/   — TelegramAdapter, WebhookAdapter, DiscordAdapter (stub)
├── cli/        — openaios start|status|init|audit|service|upgrade
└── images/
    └── agent/  — Docker image (node:22 + claude CLI + call_agent tool)
```

### Key Interfaces

openAIOS is built on four core interfaces that make every component swappable:

- **`RunnerAdapter`** — execute a turn against any model backend
- **`GovernanceAdapter`** — enforce policies (local deny-by-default or external API)
- **`ChannelAdapter`** — connect any messaging platform
- **`SessionStore`** — persist conversation state (SQLite or custom)

### Deployment

openAIOS runs as a single Node.js process managed by systemd (Linux) or launchd (macOS):

```bash
# Install
curl -fsSL https://raw.githubusercontent.com/NeoForgeEngineering/openaios/main/install.sh | bash

# Configure
openaios init        # scaffolds openAIOS.yml

# Run
openaios start       # foreground
openaios service install  # as system service
```

Network binding defaults to **Tailscale** — no public ports exposed. The built-in web dashboard provides live logs, agent status, session history, budget tracking, and security audit results.

### Monitoring

- **Web Dashboard** at `http://localhost:{port}` — dark-themed, real-time
- **SSE stream** at `/api/events` — live structured log streaming
- **Security Auditor** — static config checks + dynamic runtime checks every 30 minutes
- **Structured logging** — TTY-formatted in dev, JSON in production (systemd)

---

## Getting Started

```bash
git clone https://github.com/NeoForgeEngineering/openaios
cd openaios
pnpm install && pnpm build
openaios init
openaios start
```

See the [README](../README.md) for a complete quickstart with Ollama + Webhook.

---

## License

AGPL-3.0 with a commercial exception. See [COMMERCIAL_LICENSE.md](../COMMERCIAL_LICENSE.md).
