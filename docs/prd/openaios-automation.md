# PRD: @openaios/automation

## Problem Statement
OpenAIOS agents only respond to inbound channel messages. There's no way to schedule recurring tasks (daily reports, periodic checks) or receive inbound webhooks (GitHub events, form submissions) that trigger agent work autonomously.

## Success Criteria
- Cron scheduler: RRULE-based scheduling with timezone support
- Job history: SQLite-backed execution log
- Webhook receiver: inbound HTTP with idempotency keys
- Dispatcher: creates RunInput, dispatches through a provided callback
- Config additions fully optional
- All tests pass

## Scope
### In Scope
- CronScheduler with RRULE parsing
- JobHistory (SQLite log of executions)
- WebhookReceiver with idempotency dedup
- Dispatcher that builds RunInput and calls a dispatch callback

### Out of Scope
- Complex workflow chains (job A triggers job B)
- Webhook response transformation
- Retry with backoff (agents handle their own retries)
