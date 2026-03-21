# Interface Specifications — @openaios/tools

## Core Interfaces (packages/core/src/interfaces/tool.ts)

```typescript
import type { z } from 'zod'

interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodType
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>
}

interface ToolContext {
  sessionKey: string
  agentName: string
  workspaceDir: string
}

interface ToolResult {
  type: 'text' | 'json' | 'image' | 'error'
  content: string | Record<string, unknown>
}
```

## ToolRegistry (packages/tools/src/registry.ts)

```typescript
class ToolRegistry {
  add(tool: ToolDefinition): void        // throws on duplicate
  get(name: string): ToolDefinition | undefined
  has(name: string): boolean
  list(): ToolDefinition[]
  remove(name: string): boolean          // returns false if not found
}
```

## ToolExecutor (packages/tools/src/executor.ts)

```typescript
class ToolExecutor {
  constructor(registry: ToolRegistry, governance: GovernanceAdapter)
  execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult>
}
```

**Error contract:**
- Tool not found → `{ type: 'error', content: 'Tool not found: <name>' }`
- Governance denied → `{ type: 'error', content: 'Denied: <reason>' }`
- Execution throws → `{ type: 'error', content: 'Tool execution failed: <message>' }`

## Config Schema (ToolsSchema)

```typescript
const ToolsSchema = z.object({
  search_provider: z.enum(['brave', 'searxng', 'tavily']).optional(),
  search_api_key: z.string().optional(),
  url_allowlist: z.array(z.string()).optional(),
  url_denylist: z.array(z.string()).optional(),
  br: z.object({
    url: z.string(),
    token: z.string(),
  }).optional(),
}).optional()
```

## Built-in Tool Inputs/Outputs

### web-fetch
- Input: `{ url: string }`
- Output: `{ type: 'text', content: string }` or error

### web-search
- Input: `{ query: string, count?: number }`
- Output: `{ type: 'json', content: { results: Array<{ title, url, snippet }> } }` or error

### pdf-parse
- Input: `{ url?: string, base64?: string }`
- Output: `{ type: 'text', content: string }` or error

### image-analyze
- Input: `{ url?: string, base64?: string, prompt?: string }`
- Output: `{ type: 'text', content: string }` or error
