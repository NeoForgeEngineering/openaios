# FORGE Learnings

Accumulated knowledge from development cycles.

## Patterns

<!-- Successful approaches to reuse -->

### tests-before-ship
*Added: 2026-03-03*

Always run a FORGE verification cycle for untested components before pushing. The AgentBus shipped without tests — a verification cycle caught zero gaps but established the baseline. Cost: ~30 min. Value: confidence + regression safety.

### webhook-sync-request-response
*Added: 2026-03-04*

For local testing without a third-party channel (Telegram, Discord), implement a synchronous HTTP webhook: POST holds open until the agent calls send(), then returns {output, messageId}. Key design: shared HTTP server in start.ts routes by path to each WebhookAdapter; adapter parks a resolver in a Map keyed by requestId (= source.id), which send() resolves. RouterCore always calls send() before returning, so no polling needed — just await handler() then await the already-resolved promise. Use event-based body reading (req.on('data'/'end')) not for-await on IncomingMessage.

## Anti-Patterns

<!-- Approaches to avoid -->

## Decisions

<!-- Key decisions and their rationale -->

## Tools

<!-- Useful tools and techniques -->
