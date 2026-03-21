# Tasks: @openaios/memory

## Task Breakdown (session-sized, ordered by dependency)

### T1: Core interfaces + config schema
- Add `packages/core/src/interfaces/memory.ts` (MemoryAdapter, MemoryEntry)
- Extend MemorySchema in config.ts with provider, model, dimensions, top_k, decay_half_life_days, br
- Export from index.ts
- Add MockMemoryStore to testing/index.ts
- Build core to verify

### T2: Package scaffolding + embedding provider interface
- Create `packages/memory/` with package.json, tsconfig.json
- Implement embedding-provider.ts (interface + factory)
- Implement Ollama provider (simplest, local, no key needed)
- Write embedding provider tests

### T3: MemoryStore + SQLite-vec
- Implement memory-store.ts (SQLite + sqlite-vec)
- Schema creation, store, get, delete
- Write store CRUD tests

### T4: Hybrid search + MMR + temporal decay
- Implement hybrid-search.ts (FTS5 + vector, RRF merge)
- Implement mmr-reranker.ts
- Implement temporal-decay.ts
- Integrate into MemoryStore.search()
- Write search tests

### T5: Prompt injector + remaining embedding providers
- Implement prompt-injector.ts
- Implement OpenAI, Voyage, Mistral, Gemini embedding providers
- Write prompt injector tests

### T6: Memory tools + CLI integration
- Implement memory_search and memory_get tool definitions
- Add setupMemory() helper in start.ts
- Register tools into ToolRegistry
- Full build + test verification
