---
title: What is openAIOS?
description: An introduction to openAIOS — what it is, what problems it solves, and how it works.
sidebar:
  order: 1
---

openAIOS is a **model-agnostic, secure-by-default AI agent orchestration OS**. It connects any AI model to any messaging channel with built-in governance, budget enforcement, container isolation, and governed inter-agent communication.

Think of it as a production-grade runtime for deploying AI agents — not just a chat wrapper, but a full operating system layer that handles the hard parts: security, spending limits, multi-agent coordination, and deployment.

## What it does

- **Channel → Agent → Channel** — messages arrive via Telegram/Discord/Webhook, get processed by an autonomous runner, responses are sent back
- **Autonomous runners** — agents are configured once at startup and own their own session state, system prompt, tools, and workspace
- **Long-lived Docker containers** — agents run in persistent containers (`docker exec` per turn), not ephemeral processes
- **Agent bus** — governed request/response between agents within policy bounds
- **Budget tracking** — per-agent spending limits with block/downgrade/warn actions
- **Deny-by-default permissions** — agents only get the tools you explicitly allow
- **Hot-reload** — change agent config (persona, skills, permissions) via `reconfigure()` without restarting or losing sessions
- **Skills** — inject OpenClaw-compatible `SKILL.md` files into agent system prompts
- **Live dashboard + TUI** — real-time web UI and terminal UI with logs, status, config editing, and security audit
- **Federation (BR platform)** — route agent calls across nodes when using Bot Resources governance

## Core design principles

### 1. Agent autonomy

Runners are autonomous employees, not stateless workers. Each runner receives its `AgentConfig` once at startup — system prompt, model, tools, workspace — and owns its own session continuity. The router is a thin mailroom dispatcher that only passes `{ sessionKey, message }` and tracks cost.

### 2. Security is not optional

Every agent starts with zero permissions. You explicitly allow each tool. The security auditor runs checks at startup and every 30 minutes. There is no "allow all" shortcut.

### 3. Model-agnostic

openAIOS doesn't lock you into one model provider. Each agent declares which LLM engine drives it via `runner.llm`:

| `runner.llm` | Engine | Use case |
|--------------|--------|----------|
| `claude-code` (default) | Claude Code CLI | Full coding agent with tool use |
| `ollama` | Ollama HTTP API | Local models, private data |
| `openai-compat` | Any OpenAI-compatible API | Groq, OpenRouter, Anthropic direct |
| `gemini` | Google Gemini | Gemini models via gateway |

Non-`claude-code` engines require `runner.llm_config.base_url` pointing to an Anthropic-compatible gateway (LiteLLM, claude-code-router, etc.).

### 4. One config file

Everything is declared in `openAIOS.yml` and validated by Zod at startup. Agents, channels, permissions, budgets, capabilities — all in one place. Invalid configs fail fast with clear error messages.

### 5. Production-ready

Systemd/launchd service management, structured JSON logging, Tailscale-first networking, automated security auditing, and a curl installer for easy deployment.

## Architecture at a glance

![openAIOS Architecture](/openaios/architecture.svg)

## Package structure

```
packages/
├── core/       — Zod schemas, TypeScript interfaces, config loader, logger
├── runner/     — ClaudeCodeRunner (native), DockerRunner (docker exec), factory
├── budget/     — SQLite-backed BudgetManager
├── governance/ — LocalGovernance (in-process), BRGovernance (external API)
├── router/     — RouterCore, AgentBus, SessionStore
├── channels/   — TelegramAdapter, WebhookAdapter, DiscordAdapter
├── cli/        — openaios start|status|init|audit|tui|service|upgrade
└── images/
    └── agent/  — Docker image (node:22 + claude CLI + call_agent tool)
```

## Next steps

- [Quickstart](/openaios/getting-started/quickstart/) — get running in 5 minutes
- [Configuration](/openaios/getting-started/configuration/) — full config reference
- [openAIOS vs OpenClaw](/openaios/guides/openaios-vs-openclaw/) — how we compare
