---
title: Governance Extensions
description: DM pairing, path policies, rate limiting, and audit logging for enterprise governance.
sidebar:
  order: 3
---

The `@openaios/governance` package extends the base allow/deny tool permissions with **DM pairing**, **path restrictions**, **rate limiting**, and **audit logging**.

## DM Pairing

Bind a channel DM to an agent with a 6-digit code before allowing messages. Useful for controlling who can talk to your agents.

```typescript
const pairing = new PairingManager({ ttlSeconds: 300 })
const code = pairing.createCode('assistant')  // "482917"
// User enters code in DM → verified
pairing.verify('assistant', code)  // true
```

Codes expire after the configured TTL (default 5 minutes).

## Path Policy

Restrict which file paths agents can access, per agent:

```yaml
governance:
  paths:
    assistant:
      allow:
        - "/workspace/**"
      deny:
        - "/workspace/.env"
        - "/workspace/secrets/**"
    researcher:
      allow:
        - "/data/**"
```

Deny rules take precedence over allow. Supports `*` (single segment) and `**` (globstar) patterns.

## Rate Limiting

Token-bucket rate limiting per agent prevents runaway usage:

```yaml
governance:
  rate_limits:
    assistant:
      capacity: 10            # max burst
      refill_per_second: 1    # sustained rate
    researcher:
      capacity: 5
      refill_per_second: 0.5
```

When an agent exceeds its rate limit, tool calls are denied with a clear error message until tokens refill.

## Audit Logging

All governance decisions are logged to SQLite for compliance and debugging:

```yaml
governance:
  audit:
    prune_after_days: 90      # auto-cleanup
```

Logged events:
- `tool_use` — every tool execution (allowed or denied)
- `turn_cost` — cost and token usage per turn
- `policy_deny` — path policy denials
- `rate_limit` — rate limit exceeded events

Query the audit log programmatically:

```typescript
const entries = auditLog.query({
  agentName: 'assistant',
  eventType: 'rate_limit',
  limit: 50,
})
```

## Integration with LocalGovernance

All extensions integrate into the existing `checkPolicy` flow:

1. **Rate limiter** checked first (fast, in-memory)
2. **Allow/deny list** checked (existing behavior)
3. **Path policy** checked for file-access tools
4. All decisions logged to **audit log**

Existing configs without these fields continue to work unchanged.
