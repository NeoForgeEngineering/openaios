# openAIOS Security

## Threat Model

openAIOS runs AI agents that can execute tools on the host system. The primary threats are:

1. **Prompt injection** — user input manipulates agent to perform unintended actions
2. **Privilege escalation** — agent accesses resources outside its intended scope
3. **Credential exposure** — secrets leak via logs, config files, or agent output
4. **Budget abuse** — agent consumes unbounded resources (tokens, API costs)
5. **Unauthorized agent-to-agent calls** — one agent delegates to another it shouldn't reach

## Security Controls

### 1. Deny-by-default tool permissions

Every agent must explicitly list allowed tools. No tools are permitted by default.

```yaml
permissions:
  allow: [Read, Glob]  # Only these two tools are allowed
  deny: [Bash]         # Explicit deny — overrides any allow
```

An empty `allow` list blocks all tools. A wildcard `*` in `allow` permits all (use with caution).

### 2. CLI flag injection prevention

The `ClaudeCodeRunner` and `DockerRunner` use `spawn()` (not `shell: true`) and always pass `--` before user input:

```typescript
spawn('claude', [...flags, '--', userMessage], { shell: false })
```

This ensures user-supplied text can never be interpreted as a CLI flag, regardless of content.

### 3. Input validation

| Input | Validation |
|---|---|
| Agent name | `/^[a-z0-9-]+$/` |
| User/session ID | `/^[a-zA-Z0-9:_-]+$/` |
| Message size | ≤ 16KB |

### 4. Credential handling

- Secrets live in `/home/aios/.env` (chmod 600, owned by `aios`)
- Config files (`openAIOS.yml`) use `${ENV_VAR}` references — never inline secrets
- `.gitignore` excludes `.env`, `openAIOS.yml`, `data/`, `workspaces/`
- systemd `EnvironmentFile` reads secrets at runtime from the env file

### 5. Network: Tailscale-first

Default binding is `tailscale` — the runtime only listens on the Tailscale interface. No public ports are exposed. The Telegram/Discord bots use outbound polling (not inbound webhooks), so no inbound ports are required for those channels.

The internal agent bus HTTP server binds to `127.0.0.1` only — it is never reachable from outside the host.

Webhooks (if used) should be served behind Tailscale funnel or a reverse proxy.

### 6. Systemd hardening

The systemd unit applies:
- `NoNewPrivileges=yes` — prevents setuid/capability escalation
- `PrivateTmp=yes` — isolated /tmp namespace
- `ProtectKernelTunables=yes`
- `ProtectKernelModules=yes`
- `ProtectControlGroups=yes`
- `RestrictRealtime=yes`
- `RestrictSUIDSGID=yes`

### 7. Docker container isolation

In `runner.mode: docker`, each agent runs in its own container with:
- Memory and CPU hard limits (`--memory`, `--cpus`)
- No host filesystem mounts (workspace via named Docker volume only)
- Agent containers share the `openaios` bridge network — not the host network

### 8. Agent bus security

The internal bus HTTP server uses a one-time UUID bearer token generated at startup:

```
Authorization: Bearer {randomUUID()}
```

The token is injected into containers via `OPENAIOS_BUS_TOKEN` at `docker run` time. Requests without the correct token return 401. The server only binds to `127.0.0.1`.

Agent-to-agent calls pass two authorization layers:

1. **GovernanceAdapter.checkPolicy** — `call_agent` must be in the calling agent's `permissions.allow` list (auto-added when `capabilities['agent-calls']` is non-empty)
2. **AgentBus.allowedCallees** — the target agent must be explicitly listed in the caller's `capabilities['agent-calls']`

Both layers must pass. This prevents:
- Agents calling other agents they were not explicitly given permission to reach
- Circular call chains from bypassing governance (each hop is independently checked)

### 9. Budget controls

The `BudgetManager` enforces per-agent spending limits. On budget exceeded:
- `block` — refuse to run the agent
- `downgrade` — switch to a cheaper local model
- `warn` — log a warning but continue

Agent-to-agent bus calls are budgeted against the **callee** agent's limit, not the caller's. A runaway delegation chain hits each agent's individual budget ceiling.

### 10. Governance: fail-open vs fail-secure

BRGovernance (if configured) has a configurable failure mode:

```yaml
governance:
  br:
    fail_secure: false  # false = allow on timeout (default); true = block
```

LocalGovernance never fails — it's a pure in-process check.

## What openAIOS Does NOT Do

- No community extension/plugin marketplace
- No automatic model selection based on user prompts (only config-driven)
- No external network access by default (Tailscale-only binding)
- No credential storage — all secrets via environment variables

## Known Limitations

1. **Native mode: agent isolation is user-level** — in `runner.mode: native`, all agents run as the `aios` user. A compromised agent can read files accessible to that user. Use `runner.mode: docker` for stronger isolation.

2. **In-memory conversation history** — Ollama and OpenAI-compat runners store conversation history in memory. This is lost on restart and is not protected from other processes running as `aios`.

3. **No per-user rate limiting** — per-user message rate limiting is not yet implemented. A malicious user could send many messages rapidly.

4. **Docker socket access** — docker mode requires the `aios` user to have Docker access (typically via the `docker` group). This is equivalent to root access on the host. Consider using rootless Docker or a Docker socket proxy.

## Security Checklist

- [x] AGPL-3.0 license + commercial exception documented
- [x] Deny-by-default permissions in config schema
- [x] `--` end-of-flags separator before all user input to claude CLI
- [x] Input validation: agent name regex, session ID regex, 16KB message limit
- [x] No credentials in config files — env vars only
- [x] Tailscale bind by default
- [x] Bus HTTP server bound to 127.0.0.1 only, one-time UUID token
- [x] Two-layer agent-to-agent authorization (governance + allowedCallees)
- [x] Docker container memory/CPU limits
- [x] Budget limits with block/downgrade/warn actions
- [x] Fail-open governance with explicit opt-in to fail-secure
- [x] No community extension/skill marketplace
- [ ] Per-user rate limiting (future)
- [ ] Rootless Docker / Docker socket proxy (future)
- [ ] Audit log to file (future)
