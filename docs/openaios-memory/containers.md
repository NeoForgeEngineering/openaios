# Container Architecture — @openaios/memory (C4 Level 2)

## Containers

### 1. `packages/memory/` (new npm package)
- **Purpose:** MemoryStore, embedding providers, hybrid search, prompt injector, memory tools
- **Technology:** TypeScript, better-sqlite3, sqlite-vec
- **Dependencies:** `@openaios/core` (interfaces), `better-sqlite3`, `sqlite-vec`

### 2. `packages/core/` (modified)
- **Purpose:** New `MemoryAdapter`, `MemoryEntry` interface + config schema extensions
- **Changes:** New interface file, schema extensions, testing mock, index exports

### 3. `packages/cli/` (modified)
- **Purpose:** Instantiate MemoryStore + register memory tools at startup
- **Changes:** `start.ts` gets `setupMemory()` helper

## Dependency Map

```
@openaios/memory
  ├── @openaios/core (interfaces, config types)
  ├── better-sqlite3 (SQLite database)
  └── sqlite-vec (vector extension)

@openaios/cli
  ├── @openaios/memory (instantiation)
  ├── @openaios/tools (tool registration)
  └── @openaios/core (config)
```
