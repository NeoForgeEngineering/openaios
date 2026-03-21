---
title: Automation
description: Cron scheduling and webhook receivers for autonomous agent tasks.
sidebar:
  order: 4
---

The `@openaios/automation` package lets agents work autonomously — scheduled tasks via cron and inbound event processing via webhooks.

## Cron Scheduling

Schedule recurring agent tasks with standard 5-field cron expressions:

```yaml
automation:
  cron:
    jobs:
      - name: daily-report
        agent: assistant
        schedule: "0 9 * * MON-FRI"
        message: "Generate the daily status report and post to Slack."

      - name: health-check
        agent: monitor
        schedule: "*/15 * * * *"
        message: "Check all service endpoints and alert on failures."
```

### Supported syntax

| Field | Values | Examples |
|-------|--------|---------|
| Minute | 0-59 | `0`, `*/15`, `0,30` |
| Hour | 0-23 | `9`, `9-17` |
| Day of month | 1-31 | `1`, `15` |
| Month | 1-12 | `*` |
| Day of week | 0-7 or names | `MON-FRI`, `1,3,5` |

### Job history

Every cron execution is logged to SQLite with status, duration, and any errors. Old entries are automatically pruned.

## Webhooks

Receive inbound HTTP events that trigger agent work:

```yaml
automation:
  webhooks:
    paths:
      - path: /hooks/github
        agent: assistant
        token: ${WEBHOOK_SECRET}

      - path: /hooks/alerts
        agent: monitor
```

### Features

- **Token authentication** — optional `Bearer` token validation
- **Idempotency keys** — duplicate requests (same `Idempotency-Key` header) are safely ignored
- **JSON parsing** — request body is parsed and forwarded as the agent message
- **Custom messages** — if the body contains a `message` field, it's used directly

### Example: GitHub webhook

```bash
curl -X POST http://localhost:3000/hooks/github \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: delivery-123" \
  -d '{"message": "PR #42 merged: add user authentication"}'
```

The agent receives: `"PR #42 merged: add user authentication"` and can take action based on its persona and tools.
