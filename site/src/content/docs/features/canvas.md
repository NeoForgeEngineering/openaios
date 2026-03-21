---
title: Canvas (A2UI)
description: Agent-to-UI protocol for visual workspaces with forms, tables, charts, and interactive components.
sidebar:
  order: 11
---

The `@openaios/canvas` package implements the **A2UI (Agent-to-UI) protocol** — agents push visual components to connected UI clients over WebSocket.

## Concept

Instead of text-only responses, agents can create visual workspaces with forms, tables, charts, buttons, and markdown. The canvas is a shared state that agents push updates to and UI clients render.

```
Agent → CanvasServer → WebSocket → UI Client
                                  ←  Actions (button clicks, form submits)
```

## Components

| Type | Helper | Description |
|------|--------|-------------|
| `form` | `createForm()` | Input forms with text, number, select, checkbox fields |
| `table` | `createTable()` | Data tables with sortable columns |
| `chart` | `createChart()` | Bar, line, pie, doughnut charts |
| `button` | `createButton()` | Action buttons (primary, secondary, danger) |
| `markdown` | `createMarkdown()` | Rich text content |

## Usage

### Server-side (agent)

```typescript
import { CanvasServer, createTable, createButton } from '@openaios/canvas'

const canvas = new CanvasServer({ server: httpServer })

// Push components to a session
canvas.push('session-123', [
  createTable('users-table', {
    title: 'Active Users',
    columns: [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'role', label: 'Role' },
    ],
    rows: [
      { name: 'Alice', role: 'admin' },
      { name: 'Bob', role: 'user' },
    ],
    order: 1,
  }),
  createButton('refresh-btn', {
    label: 'Refresh',
    actionType: 'refresh_users',
    variant: 'primary',
    order: 2,
  }),
])

// Handle UI actions
canvas.onAction(async (sessionId, componentId, actionType, data) => {
  if (actionType === 'refresh_users') {
    // Fetch fresh data and update the table
    canvas.update(sessionId, createTable('users-table', { ... }))
  }
})
```

### Client-side (UI)

```javascript
const ws = new WebSocket('ws://localhost:3000/canvas?session=session-123')

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)

  switch (msg.type) {
    case 'canvas:state':    // Initial state on connect
    case 'canvas:push':     // New components added
      renderComponents(msg.components)
      break
    case 'canvas:update':   // Single component updated
      updateComponent(msg.componentId, msg.components[0])
      break
    case 'canvas:remove':   // Component removed
      removeComponent(msg.componentId)
      break
    case 'canvas:reset':    // Canvas cleared
      clearCanvas()
      break
  }
}

// Send action back to agent
function handleButtonClick(componentId, actionType) {
  ws.send(JSON.stringify({
    type: 'canvas:action',
    sessionId: 'session-123',
    action: { componentId, actionType },
    timestampMs: Date.now(),
  }))
}
```

## Protocol Messages

| Message | Direction | Description |
|---------|-----------|-------------|
| `canvas:state` | Server → Client | Full state on connect |
| `canvas:push` | Server → Client | Add components |
| `canvas:update` | Server → Client | Update single component |
| `canvas:remove` | Server → Client | Remove component |
| `canvas:reset` | Server → Client | Clear all components |
| `canvas:action` | Client → Server | User interaction |

## State Management

The `CanvasStateManager` maintains per-session component state:
- Components are keyed by `id` (upsert on push)
- Components are ordered by `order` field (ascending)
- Sessions are isolated — each session has its own canvas
- State is sent to new clients on connect
