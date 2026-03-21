# Component Architecture — @openaios/memory (C4 Level 3)

## Package: `packages/memory/src/`

### memory-store.ts — MemoryStore (implements MemoryAdapter)
- Constructor: `(opts: { dir: string, embeddingProvider: EmbeddingProvider, dimensions: number, topK: number, decayHalfLifeDays: number })`
- Creates SQLite DB at `{dir}/memory.db`, loads sqlite-vec extension
- Tables: `memories` (id, agent_name, key, content, metadata_json, embedding BLOB, created_at, updated_at)
- FTS5 virtual table: `memories_fts` (key, content)
- `store()`, `search()`, `get()`, `delete()`, `buildPromptContext()` per MemoryAdapter interface

### embedding-provider.ts — EmbeddingProvider interface + factory
- `embed(text: string): Promise<Float32Array>` — single text embedding
- `embedBatch(texts: string[]): Promise<Float32Array[]>` — batch embedding
- `createEmbeddingProvider(provider, model, opts)` — factory function

### embeddings/ — Provider implementations
- `openai.ts` — OpenAI text-embedding-3-small/large
- `ollama.ts` — Local Ollama models (nomic-embed-text, etc.)
- `voyage.ts` — Voyage AI voyage-3
- `mistral.ts` — Mistral mistral-embed
- `gemini.ts` — Google text-embedding-004

### search/hybrid-search.ts — Hybrid search
- `hybridSearch(db, agentName, queryEmbedding, queryText, topK)`
- Runs FTS5 BM25 + vector cosine similarity in parallel
- Merges with reciprocal rank fusion (RRF)

### search/mmr-reranker.ts — Maximal Marginal Relevance
- `mmrRerank(results, queryEmbedding, lambda, k)`
- Iteratively selects results balancing relevance vs diversity

### search/temporal-decay.ts — Time-based weighting
- `applyTemporalDecay(results, halfLifeDays, now)`
- Exponential decay: `score *= 2^(-age/halfLife)`

### prompt-injector.ts — Build memory context
- `buildPromptContext(memories: MemoryEntry[], maxTokens: number): string`
- Formats top memories as markdown, truncates to token budget
- Rough token estimate: chars / 4

### tools/ — Tool registrations
- `memory-search.ts` — Registers `memory_search` tool definition
- `memory-get.ts` — Registers `memory_get` tool definition

## Package: `packages/core/src/`

### interfaces/memory.ts (new)
- `MemoryAdapter` — store, search, get, delete, buildPromptContext
- `MemoryEntry` — key, content, metadata, score, createdAt, updatedAt

### schema/config.ts (extend)
- Extend MemorySchema with provider, model, dimensions, top_k, decay_half_life_days, br

### testing/index.ts (extend)
- `MockMemoryStore` — in-memory implementation
