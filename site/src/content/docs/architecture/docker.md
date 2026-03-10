---
title: Docker Isolation
description: Running agents in long-lived Docker containers with resource limits and browser sidecars.
sidebar:
  order: 4
---

When `runner.env: docker`, each agent runs in a persistent container. Turns execute via `docker exec` — no per-turn container overhead, persistent workspace, and full resource isolation.

## Configuration

```yaml
agents:
  - name: coder
    runner:
      env: docker                      # default
      llm: claude-code                 # or openai-compat, gemini, ollama
      docker:
        image: openaios/agent:latest   # node:22 + claude CLI + call_agent
        memory: 1g                     # container memory limit
        cpus: 1                        # CPU limit
    capabilities:
      browser: true                    # provisions Chromium sidecar
      agent-calls: [researcher]        # can call other agents
```

## Container lifecycle

### Startup

The `ContainerOrchestrator` manages container lifecycle:

1. Create `openaios` Docker network (bridge, idempotent)
2. For each docker agent, `ensureRunning()`:
   - Create workspace volume: `openaios-{name}-workspace`
   - Start container: `openaios-{name}` with `tail -f /dev/null` (keeps alive)
   - Inject env vars: `OPENAIOS_BUS_URL`, `OPENAIOS_BUS_TOKEN`
3. If `capabilities.browser: true`, `CapabilityProvisioner` starts: `openaios-{name}-browser` (Chromium CDP sidecar)

### Per-turn execution

Each message triggers:

```bash
docker exec openaios-{name} claude \
  --model {model} \
  --system-prompt {prompt} \
  --allowedTools {tools} \
  -- \
  "{user message}"
```

The `--` separator prevents CLI flag injection from user input.

### Shutdown

On SIGINT/SIGTERM, the orchestrator stops and removes all managed containers and browser sidecars.

## Naming conventions

| Resource | Name |
|----------|------|
| Agent container | `openaios-{agentName}` |
| Browser sidecar | `openaios-{agentName}-browser` |
| Docker network | `openaios` |
| Workspace volume | `openaios-{agentName}-workspace` |

## Browser sidecar

When `capabilities.browser: true`, a Chromium container is provisioned alongside the agent:

- Connected via the `openaios` Docker network
- Exposes CDP (Chrome DevTools Protocol) to the agent container
- Agent can use Playwright for web automation
- Isolated from the host — no direct internet access unless configured

## Shared memory

The `memory.dir` directory (default `./data/memory`) is mounted at `/workspace/memory` in every agent container. Agents can read/write shared markdown files for persistent knowledge.

## Resource limits

Docker resource limits are enforced at the container level:

- **Memory** — hard limit, container is OOM-killed if exceeded
- **CPUs** — CPU shares, soft limit
- **No privileged mode** — containers run unprivileged
- **Private volumes** — each agent gets its own workspace volume
