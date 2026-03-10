---
title: CLI Commands
description: Complete reference for the openaios command-line interface.
sidebar:
  order: 1
---

## `openaios start`

Start the openAIOS runtime.

```bash
openaios start              # uses ./openAIOS.yml
openaios start -c path.yml  # custom config path
```

Starts the HTTP server, channel adapters, and dashboard. Runs in the foreground — use systemd/launchd for background execution.

## `openaios status`

Show runtime status.

```bash
openaios status
```

Displays:
- Agent health (runner health checks)
- Active session counts per agent
- Budget spend vs limits
- Uptime

## `openaios init`

Scaffold a new `openAIOS.yml` in the current directory.

```bash
openaios init
```

Creates a minimal config with one webhook agent using Ollama. Also scaffolds `./data/memory/facts.md` for shared agent memory.

## `openaios audit`

Run the security auditor.

```bash
openaios audit              # uses ./openAIOS.yml
openaios audit -c path.yml  # custom config
```

Performs static analysis on your config and reports findings. Exit code is non-zero if critical findings exist — useful in CI pipelines.

### Findings

| Code | Severity | Description |
|------|----------|-------------|
| `OVERLY_BROAD_PERMISSIONS` | critical | Bash or * in allow without deny |
| `NO_BUDGET_LIMIT` | warning | Agent not in budget.agents |
| `WEBHOOK_NO_SECRET` | warning | Non-localhost webhook without secret |
| `AGENT_CALLS_LOCAL_ONLY` | info | Agent bus with local governance |
| `CIRCULAR_AGENT_CALLS` | critical | A → B → A cycle |
| `NATIVE_SAFEGUARD` | warning/critical | Native runner without `allow_host_access`; non-claude-code LLM without gateway |

## `openaios service`

Manage the openAIOS system service (systemd on Linux, launchd on macOS).

```bash
openaios service install    # install service unit
openaios service uninstall  # remove service unit
openaios service start      # start the service
openaios service stop       # stop the service
openaios service restart    # restart the service
openaios service status     # show service status
openaios service logs       # follow service logs
```

## `openaios tui`

Interactive terminal UI for monitoring and configuring agents.

```bash
openaios tui              # uses ./openAIOS.yml
openaios tui -c path.yml  # custom config
```

An Ink-based terminal interface with three tabs:

| Key | Tab | Description |
|-----|-----|-------------|
| `1` | Status | Agent health, sessions, budget |
| `2` | Logs | Live structured log stream |
| `3` | Configure | Edit persona, skills, permissions, capabilities |

In the Configure tab:
- `$EDITOR` opens for persona editing
- `Space` toggles skills, browser capability
- `s` saves changes via the dashboard PATCH API (hot-reload, no restart)

Press `q` or `Ctrl+C` to quit.

## `openaios upgrade`

Pull latest code and restart the service.

```bash
openaios upgrade
```

Runs: `git pull` → `pnpm install` → `pnpm build` → `service restart`
