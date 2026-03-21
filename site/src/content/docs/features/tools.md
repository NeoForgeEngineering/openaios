---
title: Tool Registry
description: Governed tool execution with built-in web fetch, search, PDF parsing, and image analysis.
sidebar:
  order: 1
---

The `@openaios/tools` package provides a **governed tool registry** — a shared catalog where any package can register tools that agents execute through a governance-checked pipeline.

## How it works

```
Agent turn → tool invocation → ToolExecutor
  → registry.get(name)
  → governance.checkPolicy()
  → tool.execute()
  → governance.reportToolUse()
```

Every tool execution passes through governance before running. Denied tools return an error result without executing.

## Built-in tools

| Tool | Description |
|------|-------------|
| `web_fetch` | Fetch URL content with allowlist/denylist enforcement |
| `web_search` | Search via Brave, SearXNG, or Tavily |
| `pdf_parse` | Extract text from PDFs (URL or base64) |
| `image_analyze` | Vision-capable LLM image analysis |

## Configuration

All fields are optional — existing configs stay valid:

```yaml
tools:
  search_provider: brave          # brave | searxng | tavily
  search_api_key: ${BRAVE_KEY}
  url_allowlist:                   # glob patterns
    - "https://docs.example.com/*"
  url_denylist:
    - "https://evil.com/*"
```

## Registering custom tools

Other packages register tools into the shared registry:

```typescript
import type { ToolDefinition, ToolContext, ToolResult } from '@openaios/core'
import { z } from 'zod'

const myTool: ToolDefinition = {
  name: 'my_tool',
  description: 'Does something useful',
  inputSchema: z.object({ query: z.string() }),
  async execute(input, ctx: ToolContext): Promise<ToolResult> {
    return { type: 'text', content: 'result' }
  },
}

// In start.ts or plugin init:
toolRegistry.add(myTool)
```

## Tool result types

| Type | Use case |
|------|----------|
| `text` | Plain text output |
| `json` | Structured data (objects, arrays) |
| `image` | Base64-encoded image |
| `error` | Error message (tool not found, denied, execution failed) |
