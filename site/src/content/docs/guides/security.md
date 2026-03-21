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

## Security auditor (23 checks)

The built-in SecurityAuditor runs at startup and every 30 minutes. Run manually with `openaios audit`.

### Permissions & runner checks

| Finding | Trigger |
|---------|---------|
| `OVERLY_BROAD_PERMISSIONS` | `Bash` or `*` in allow without deny rules |
| `NATIVE_MODE_ENABLED` | Agent running unsandboxed in native mode |
| `NATIVE_NOT_EXPLICIT` | Native mode without `allow_host_access: true` |
| `LLM_GATEWAY_MISSING` | Non-claude-code LLM without `llm_config.base_url` |

### Budget & governance checks

| Finding | Trigger |
|---------|---------|
| `NO_BUDGET_LIMIT` | Agent not listed in `budget.agents` |
| `AGENT_CALLS_LOCAL_ONLY` | Agent bus with local governance only |
| `CIRCULAR_AGENT_CALLS` | A → B → A cycle detected |
| `RATE_LIMITS_NO_AUDIT` | Rate limits configured without audit logging |
| `PATH_POLICY_TOO_BROAD` | `/**` allow with no deny rules |

### Channel security checks

| Finding | Trigger |
|---------|---------|
| `WEBHOOK_NO_SECRET` | Webhook on non-localhost without secret |
| `TELEGRAM_TOKEN_HARDCODED` | Token not using `${ENV_VAR}` reference |
| `SLACK_NO_SIGNING_SECRET` | Slack on public network without signing secret |
| `GOOGLE_CHAT_PUBLIC` | Google Chat webhook on public network |
| `NO_DM_ALLOWLIST` | Multi-channel agent with no DM restrictions |
| `NO_GROUP_ROUTING` | No mention-gating for group chats |

### Feature security checks

| Finding | Trigger |
|---------|---------|
| `MEMORY_API_KEY_MISSING` | Cloud embedding provider without API key |
| `AUTOMATION_WEBHOOK_NO_TOKEN` | Public automation webhook without auth |
| `CRON_TOO_FREQUENT` | Cron job running every minute |
| `GATEWAY_NO_AUTH` | WS gateway enabled without auth token |
| `BROWSER_NO_URL_POLICY` | Browser enabled with no URL restrictions |
| `BROWSER_NATIVE_MODE` | Browser + native = full unsandboxed access |

### Runtime anomaly checks

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

- [ ] All agents run in Docker (`runner.env: docker`) — native only when explicitly needed
- [ ] All agents have explicit `permissions.allow` (no `*`)
- [ ] `Bash` is in `deny` for agents that don't need it
- [ ] All agents have budget limits
- [ ] `network.bind` is `tailscale` or `localhost`
- [ ] Webhooks have secrets configured
- [ ] Channel tokens use `${ENV_VAR}` references (not hardcoded)
- [ ] `.env` file has `chmod 600`
- [ ] Systemd hardening directives are enabled
- [ ] `openaios audit` returns clean in CI
- [ ] Docker agents have memory/CPU limits
- [ ] Browser agents have URL allowlists
- [ ] Automation webhooks have token auth
- [ ] WS gateway has auth token if enabled
- [ ] Rate limits enabled with audit logging
- [ ] Group routing requires mention for multi-channel agents
- [ ] DM allowlist configured for public-facing agents
- [ ] Agent bus calls have explicit callee lists (no wildcards)
- [ ] Non-`claude-code` LLMs use gateway config via `runner.llm_config`
