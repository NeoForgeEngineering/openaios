---
title: Security
description: openAIOS security model — threat model, controls, and hardening checklist.
sidebar:
  order: 3
---

openAIOS is designed to be secure-by-default. This page covers the threat model, security controls, and hardening recommendations.

## Threat model

AI agents with tool access are powerful — and dangerous if misconfigured. openAIOS assumes:

- **Agents are untrusted** — they only get the tools you explicitly allow
- **User input is untrusted** — messages are validated and size-limited
- **Network is hostile** — default binding is Tailscale (no public ports)
- **Credentials leak** — env-var-only secrets, never in config files

## Security controls

### 1. Deny-by-default permissions

Agents start with zero tool access. You must explicitly allow each tool:

```yaml
permissions:
  allow: [Read, Glob, Grep]     # only these tools
  deny: [Bash, Write]           # deny overrides allow
```

The SecurityAuditor flags overly broad permissions (e.g., `Bash` or `*` without deny rules).

### 2. Budget enforcement

Per-agent spending limits prevent runaway costs:

```yaml
budget:
  agents:
    assistant:
      limit: 10.00
      on_exceeded: block    # hard stop
```

### 3. CLI flag injection prevention

All runner spawns use `--` separator to prevent user input from being interpreted as CLI flags:

```typescript
spawn('claude', ['--model', model, '--', userMessage])
```

### 4. Input validation

- Agent names: alphanumeric + hyphens only
- Session IDs: validated format
- Message size: 16KB maximum
- Config: Zod schema validation at startup

### 5. Network security

- **Default bind: Tailscale** — no public port exposure
- **Agent bus: localhost only** — `127.0.0.1:{random_port}`
- **Bearer token auth** — one-time UUID for bus communication
- **Webhook secrets** — optional HMAC verification

### 6. Docker isolation

- Memory/CPU limits per container
- Private workspace volumes
- No privileged mode
- Separate browser sidecar (no browser in agent container)

### 7. Credential handling

- Secrets via `${ENV_VAR}` references only
- `.env` file with `chmod 600`
- Never committed to git
- Systemd `EnvironmentFile` for production

### 8. Systemd hardening

```ini
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/home/aios
```

## Security auditor

The built-in SecurityAuditor runs at startup and every 30 minutes.

### Static checks

| Finding | Trigger |
|---------|---------|
| `OVERLY_BROAD_PERMISSIONS` | `Bash` or `*` in allow without deny rules |
| `NO_BUDGET_LIMIT` | Agent not listed in `budget.agents` |
| `WEBHOOK_NO_SECRET` | Webhook on non-localhost without secret |
| `AGENT_CALLS_LOCAL_ONLY` | Agent bus with local governance only |
| `CIRCULAR_AGENT_CALLS` | A → B → A cycle detected |
| `NATIVE_SAFEGUARD` | Native runner without explicit `allow_host_access: true`; non-claude-code LLM on native without gateway |

### Dynamic checks

| Finding | Trigger |
|---------|---------|
| `SESSION_EXPLOSION` | >50% session growth since last audit |
| `DEAD_AGENT` | 0 sessions after >1 hour uptime |
| `GOVERNANCE_DENIAL_SPIKE` | >5 tool denials in last hour |

### Running manually

```bash
openaios audit                  # run audit, print findings
openaios audit -c config.yml    # custom config
```

Exit code is non-zero if critical findings exist — useful in CI.

## Hardening checklist

- [ ] All agents have explicit `permissions.allow` (no `*`)
- [ ] `Bash` is in `deny` for agents that don't need it
- [ ] All agents have budget limits
- [ ] `network.bind` is `tailscale` or `localhost`
- [ ] Webhooks have secrets configured
- [ ] `.env` file has `chmod 600`
- [ ] Systemd hardening directives are enabled
- [ ] `openaios audit` returns clean in CI
- [ ] Docker agents have memory/CPU limits
- [ ] Agent bus calls have explicit callee lists (no wildcards)
- [ ] Native agents have `runner.native.allow_host_access: true` set explicitly
- [ ] Non-`claude-code` LLMs use gateway config via `runner.llm_config`
