---
title: Quickstart
description: Get openAIOS running in 5 minutes with Ollama and a webhook.
sidebar:
  order: 2
---

## Prerequisites

- Node.js 22+
- pnpm 9+
- [Ollama](https://ollama.ai) with a model pulled (e.g. `ollama pull qwen2.5-coder:7b`)

## Install

### Option A: Curl installer

```bash
curl -fsSL https://raw.githubusercontent.com/NeoForgeEngineering/openaios/main/install.sh | bash
```

This installs to `~/.openaios`, auto-installs Node.js 22 via nvm if needed, and sets up pnpm.

### Option B: From source

```bash
git clone https://github.com/NeoForgeEngineering/openaios
cd openaios
pnpm install && pnpm build
```

## Configure

Create a minimal `openAIOS.yml`:

```bash
openaios init
```

Or create one manually:

```yaml
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
      env: native
      llm: ollama
      llm_config:
        base_url: "http://localhost:11434"
      native:
        allow_host_access: true
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
```

## Start

```bash
# From source
node packages/cli/dist/bin/openaios.js start

# From curl install
openaios start
```

You should see:

```
INFO [core] Loaded config: 1 agent(s)
INFO [router] Started 1 agent(s)
INFO [http] Dashboard: http://localhost:3000
INFO [http] Webhook: http://localhost:3000/webhook
```

## Send a message

```bash
curl -s -X POST http://localhost:3000/webhook \
  -H 'Content-Type: application/json' \
  -d '{"text": "What is 2 + 2?", "userId": "me"}'
```

Response:

```json
{"output": "4", "messageId": "..."}
```

## Open the dashboard

Visit [http://localhost:3000](http://localhost:3000) to see live logs, agent status, sessions, and budget tracking.

## Add Telegram

1. Create a bot via [@BotFather](https://t.me/BotFather) and get the token
2. Add to your config:

```yaml
agents:
  - name: assistant
    channels:
      telegram:
        token: ${TELEGRAM_TOKEN}
      webhook:
        path: /webhook
```

3. Set the env var and restart:

```bash
export TELEGRAM_TOKEN="your-bot-token"
openaios start
```

## Next steps

- [Configuration reference](/openaios/getting-started/configuration/) — all config options
- [System design](/openaios/architecture/system-design/) — how it works under the hood
- [Security](/openaios/guides/security/) — hardening your deployment
