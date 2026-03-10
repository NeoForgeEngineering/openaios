---
title: openAIOS vs OpenClaw
description: A detailed comparison between openAIOS and OpenClaw — architecture, security, extensibility, and when to choose each.
sidebar:
  order: 1
---

Both openAIOS and [OpenClaw](https://openclaw.ai/) solve the problem of connecting AI models to messaging platforms, but they take fundamentally different approaches.

![Architecture Comparison](/openaios/comparison.svg)

## What they share

- **Gateway pattern** — both act as a routing layer between channels and AI models
- **Channel support** — Telegram, Discord, and other messaging platforms
- **Local-first** — both can run entirely on your own hardware
- **Open source** — community-driven development

## Where they diverge

### Agent runtime

**OpenClaw** delegates all reasoning to the external [Pi agent framework](https://github.com/mariozechner/pi-agent-core). The gateway handles routing and orchestration, but the agent loop (tool calling, context management, LLM interaction) lives in a separate project.

**openAIOS** includes autonomous runner adapters as first-class components. Each agent declares its LLM engine (`runner.llm`: claude-code, openai-compat, gemini, ollama) and execution environment (`runner.env`: docker, native). The runner receives its `AgentConfig` once at startup and owns its own session state, workspace, and execution. The router is a thin mailroom dispatcher — no external agent framework dependency.

### Configuration & extensibility

**OpenClaw** uses `SKILL.md` files — markdown documents with YAML frontmatter that get injected into prompts at runtime. Over 100 community-built skills are available. Skills are discovered dynamically and selectively injected per turn.

**openAIOS** uses a single `openAIOS.yml` config file validated by Zod at startup. Everything is declared upfront: agents, channels, permissions, budgets, capabilities. Invalid configs fail fast with clear error messages. openAIOS also supports OpenClaw-compatible `SKILL.md` files — you can point `skills.dir` at your existing OpenClaw skills directory and reference skills per-agent.

### Security & governance

**OpenClaw** focuses on the gateway problem and leaves security to the user and the underlying agent framework. There is no built-in permission system or spending controls.

**openAIOS** is secure-by-default:

| Control | Detail |
|---------|--------|
| Deny-by-default permissions | Agents get zero tools unless explicitly allowed |
| Budget enforcement | Per-agent spending limits with block/downgrade/warn |
| Two-layer agent bus auth | Governance check + callee allowlist |
| Security auditor | Automated static + dynamic checks every 30 minutes |
| CLI flag injection prevention | `spawn()` with `--` separator |
| Input validation | Agent names, session IDs, message size limits (16KB) |
| Credential isolation | Env-var-only secrets, `.env` with 600 permissions |

### Multi-agent communication

**OpenClaw** does not have a built-in mechanism for agents to call other agents. Multi-agent workflows rely on external orchestration or community plugins.

**openAIOS** has a governed `AgentBus`:
- Governed request/response between agents
- Budget charged to the callee
- Circular call detection in the security auditor
- Docker-native: `call_agent` bash tool uses the bus HTTP API
- Bearer-token authentication on localhost
- **Federation (BR platform)**: cross-node routing when using Bot Resources governance

### Container isolation

**OpenClaw** runs agents as processes within the gateway. Isolation is process-level.

**openAIOS** supports full Docker isolation:
- Long-lived containers with `docker exec` per turn
- Memory/CPU limits per agent
- Private workspace volumes
- Optional browser sidecar (Playwright/Chromium)
- Agent-to-agent calls via authenticated HTTP

### Protocol

**OpenClaw** uses a WebSocket server (port 18789) as its control plane, with an OpenAI-compatible HTTP API alongside.

**openAIOS** uses HTTP throughout: REST API for webhooks and dashboard, SSE for live log streaming, internal HTTP for the agent bus.

## When to choose what

| You want... | Choose |
|-------------|--------|
| Quick personal assistant with many community skills | OpenClaw |
| Production deployment with security & budget controls | **openAIOS** |
| Existing Pi framework integration | OpenClaw |
| Model-agnostic setup (Claude + Ollama + OpenAI) | **openAIOS** |
| Governed multi-agent workflows | **openAIOS** |
| Large plugin/skill ecosystem (with openAIOS compatibility) | OpenClaw |
| Multi-node federation (BR platform) | **openAIOS** |
| Hot-reload config without restart | **openAIOS** |
| Docker-isolated agents | **openAIOS** |
| WebSocket-based control plane | OpenClaw |

## Summary

OpenClaw excels as a personal AI assistant with a rich skill ecosystem and familiar gateway pattern. openAIOS targets production deployments where security, governance, budget control, and multi-agent orchestration are requirements — not afterthoughts.
