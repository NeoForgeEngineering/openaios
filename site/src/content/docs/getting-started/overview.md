---
title: What is openAIOS?
description: An introduction to openAIOS — what it is, what problems it solves, and how it works.
sidebar:
  order: 1
---

openAIOS is a **model-agnostic, secure-by-default AI agent orchestration OS**. It connects any AI model to any messaging channel with built-in governance, budget enforcement, container isolation, and governed inter-agent communication.

Think of it as a production-grade runtime for deploying AI agents — not just a chat wrapper, but a full operating system layer that handles the hard parts: security, spending limits, multi-agent coordination, and deployment.

## What it does

- **9 channels** — Telegram, Slack, WhatsApp, Signal, Discord, Webhook, Web Chat, iMessage, Google Chat
- **Autonomous runners** — agents are configured once at startup and own their own session state, system prompt, tools, and workspace
- **Docker sandbox by default** — agents run in persistent containers with memory/CPU limits and private workspaces
- **Tool registry** — governed tool execution with built-in web fetch, search, PDF parsing, image analysis + plugin tools
- **Semantic memory** — SQLite-vec backed with hybrid search (FTS5 + vector), MMR reranking, temporal decay, and prompt injection
- **Budget tracking** — per-agent spending limits with block/downgrade/warn actions
- **Deny-by-default permissions** — agents get zero tools unless explicitly allowed
- **23-check security audit** — continuous scanning for misconfigurations and runtime anomalies
- **Cron + webhooks** — scheduled tasks and inbound event processing for autonomous agent work
- **Browser automation** — governed headless browser with navigate, click, fill, snapshot, screenshot tools
- **Voice** — TTS (ElevenLabs, OpenAI, Edge, system) and STT (Deepgram, Whisper) with channel wrapper
- **Canvas (A2UI)** — agent-driven visual workspaces with forms, tables, charts over WebSocket
- **Plugins** — plugin registry with manifests, lifecycle, and SKILL.md auto-discovery
- **Agent bus** — governed inter-agent calls with two-layer auth and budget tracking
- **Multi-model** — model catalog, API key rotation with 429 cooldown, reasoning modes (standard/fast/deep)
- **WS gateway** — JSON-RPC 2.0 WebSocket API with event streaming and presence tracking
- **Hot-reload** — change agent config via dashboard or API without restarting
- **Federation (BR platform)** — route agent calls across nodes with per-peer token auth

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

## Package structure (17 packages)

```
packages/
├── core/        — Zod schemas, interfaces, config loader, logger, testing mocks
├── runner/      — ClaudeCode, Docker, External, Anthropic SDK, OpenAI SDK runners
│                  + ModelCatalog, AuthRotation, reasoning modes
├── router/      — RouterCore, AgentBus, WS Gateway, health endpoints, sessions
├── channels/    — 9 adapters + shared utils (chunker, group router, allowlist)
├── governance/  — Local + BR governance, rate limiter, path policy, DM pairing, audit log
├── budget/      — SQLite-backed BudgetManager
├── tools/       — ToolRegistry, ToolExecutor, built-in tools (fetch, search, PDF, image)
├── memory/      — SQLite-vec MemoryStore, hybrid search, embeddings, prompt injector
├── automation/  — CronScheduler, WebhookReceiver, JobHistory
├── browser/     — agent-browser client, URL governance, session manager
├── voice/       — TTS (4 providers), STT (2 providers), VoiceChannel wrapper
├── canvas/      — A2UI protocol, CanvasServer (WS), 5 component types
├── plugins/     — PluginRegistry, manifests, lifecycle, SKILL.md loader
├── cli/         — openaios start|status|init|audit|tui|service|upgrade
│                  + dashboard, chat UI, config UI
├── br-sdk/      — Bot Resources platform client
├── br-hook/     — Bot Resources webhook handler
└── images/
    └── agent/   — Docker image (node:22 + claude CLI + call_agent tool)
```

## Next steps

- [Quickstart](/openaios/getting-started/quickstart/) — get running in 5 minutes
- [Configuration](/openaios/getting-started/configuration/) — full config reference
- [openAIOS vs OpenClaw](/openaios/guides/openaios-vs-openclaw/) — how we compare
