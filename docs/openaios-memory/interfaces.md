# Interface Specifications — @openaios/memory

## Core Interfaces (packages/core/src/interfaces/memory.ts)

```typescript
interface MemoryEntry {
  key: string
  content: string
  metadata?: Record<string, unknown>
  score?: number
  createdAt: string   // ISO 8601
  updatedAt: string   // ISO 8601
}

interface MemoryAdapter {
  store(agentName: string, key: string, content: string, metadata?: Record<string, unknown>): Promise<void>
  search(agentName: string, query: string, opts?: { topK?: number; minScore?: number }): Promise<MemoryEntry[]>
  get(agentName: string, key: string): Promise<MemoryEntry | undefined>
  delete(agentName: string, key: string): Promise<void>
  buildPromptContext(agentName: string, query: string, maxTokens: number): Promise<string>
  close(): void
}
```

## EmbeddingProvider (packages/memory/src/embedding-provider.ts)

```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<Float32Array>
  embedBatch(texts: string[]): Promise<Float32Array[]>
  readonly dimensions: number
}

function createEmbeddingProvider(
  provider: 'openai' | 'ollama' | 'voyage' | 'mistral' | 'gemini',
  model: string,
  opts?: { apiKey?: string; baseUrl?: string; dimensions?: number }
): EmbeddingProvider
```

## Config Schema Extensions (MemorySchema)

```typescript
// Extends existing MemorySchema
const MemorySchema = z.object({
  dir: z.string().default('./data/memory'),
  provider: z.enum(['openai', 'ollama', 'voyage', 'mistral', 'gemini']).optional(),
  model: z.string().optional(),
  api_key: envString().optional(),
  base_url: z.string().optional(),
  dimensions: z.number().int().positive().optional(),
  top_k: z.number().int().positive().default(5),
  decay_half_life_days: z.number().positive().default(30),
  br: z.object({ url: envString(), token: envString() }).optional(),
})
```

## Memory Tool Inputs/Outputs

### memory_search
- Input: `{ query: string, agent_name?: string, top_k?: number }`
- Output: `{ type: 'json', content: { results: MemoryEntry[] } }`

### memory_get
- Input: `{ key: string, agent_name?: string }`
- Output: `{ type: 'json', content: MemoryEntry }` or error

## Error Contract
- Store with duplicate key → upsert (update content + embedding)
- Get non-existent key → `undefined`
- Search with no results → empty array
- Embedding provider unavailable → throws (logged, turn continues without memory)
