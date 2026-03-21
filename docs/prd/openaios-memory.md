# PRD: @openaios/memory

## Problem Statement

OpenAIOS agents currently have a shared markdown memory directory but no semantic search, no embeddings, no per-agent isolation, and no way to inject relevant memories into agent system prompts. Agents must manually grep files — there's no structured memory store, no hybrid search (vector + FTS), and no temporal decay. This limits agents to basic file-based recall with no intelligence.

## Target Users

1. **Agent operators** — configure embedding providers and memory behavior via `openAIOS.yml`
2. **Agents (runtime)** — store, search, and retrieve memories during execution
3. **Package authors** — register memory_search/memory_get tools via @openaios/tools
4. **Enterprise admins (BR)** — centralized memory management via BR API

## Success Criteria

- MemoryStore backed by SQLite + sqlite-vec for vector search
- Hybrid search: BM25 FTS5 + vector cosine similarity, merged scoring
- MMR reranker for diversity in results
- Temporal decay weighting (configurable half-life)
- Per-agent memory isolation (agentName scoping)
- Prompt injector builds context string within token budget
- Multiple embedding providers: OpenAI, Ollama, Voyage, Mistral, Gemini
- memory_search and memory_get tools register into @openaios/tools ToolRegistry
- Config additions fully optional — existing configs stay valid
- MockMemoryStore in @openaios/core/testing
- All tests pass with node:test + assert/strict

## Scope

### In Scope
- MemoryAdapter interface in @openaios/core
- MemoryStore implementation (SQLite-vec backed)
- Embedding provider interface + 5 implementations
- Hybrid search (FTS5 + vector)
- MMR reranker
- Temporal decay
- Prompt injector
- memory_search and memory_get tools
- Config schema extensions
- CLI integration (setupMemory helper)

### Out of Scope
- Graph-based memory relationships
- Cross-agent memory sharing (each agent is isolated)
- Memory compaction/summarization
- Memory export/import CLI commands
