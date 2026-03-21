---
title: WebSocket Gateway
description: JSON-RPC 2.0 WebSocket API with event streaming, presence, and health endpoints.
sidebar:
  order: 7
---

The `@openaios/router` package includes a **JSON-RPC 2.0 WebSocket gateway** for real-time management, monitoring, and event streaming.

## Configuration

```yaml
gateway:
  enabled: true
  auth_token: ${GATEWAY_TOKEN}   # optional — secures WS connections
```

## Connecting

```javascript
const ws = new WebSocket('ws://localhost:3000/ws?token=YOUR_TOKEN')
```

## JSON-RPC Methods

### Built-in methods

| Method | Description |
|--------|-------------|
| `ping` | Health check — returns `{ pong: true }` |
| `agents.list` | List registered agents |
| `subscribe` | Subscribe to real-time events |
| `unsubscribe` | Stop receiving events |

### Custom methods

Register additional methods on the gateway:

```typescript
gateway.registerMethod('budget.status', async (params) => {
  return budgetManager.status(params.agentName)
})
```

### Request format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ping"
}
```

### Response format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "pong": true }
}
```

## Event Streaming

After calling `subscribe`, the client receives real-time turn lifecycle events:

```json
{
  "jsonrpc": "2.0",
  "method": "event",
  "params": {
    "type": "turn:start",
    "agentName": "assistant",
    "userId": "telegram:12345",
    "timestampMs": 1710000000000
  }
}
```

### Event types

| Event | Fields |
|-------|--------|
| `turn:start` | agentName, userId, timestampMs |
| `turn:complete` | agentName, userId, output, costUsd, model, timestampMs |
| `turn:error` | agentName, userId, error, timestampMs |

## Health Endpoints

HTTP health checks for load balancers and monitoring:

| Endpoint | Method | Response |
|----------|--------|----------|
| `/health` | GET | `{ status, uptime, agents, version }` |
| `/ready` | GET | `{ ready: true }` |

## Presence Tracking

The `WsPresence` module tracks connected WebSocket clients and typing indicators, useful for building companion UIs.
