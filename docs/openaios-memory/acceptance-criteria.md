# Acceptance Criteria — @openaios/memory

## AC1: MemoryStore CRUD

**Given** an empty MemoryStore for agent "assistant"
**When** I call `store("assistant", "greeting", "Hello world", { source: "user" })`
**Then** the memory is persisted to SQLite with an embedding vector

**Given** a stored memory with key "greeting"
**When** I call `get("assistant", "greeting")`
**Then** it returns a MemoryEntry with key, content, metadata, createdAt, updatedAt

**Given** a stored memory with key "greeting"
**When** I call `delete("assistant", "greeting")`
**Then** `get("assistant", "greeting")` returns undefined

**Given** memories stored under agent "assistant"
**When** I call `get("other-agent", "greeting")`
**Then** it returns undefined (per-agent isolation)

## AC2: Hybrid search

**Given** memories ["cats are great", "dogs are loyal", "weather is nice"]
**When** I call `search("assistant", "animals")`
**Then** "cats are great" and "dogs are loyal" rank higher than "weather is nice"
**And** results include both FTS and vector matches

## AC3: MMR reranking

**Given** 5 search results where 3 are about "cats" and 2 about "dogs"
**When** MMR reranking with lambda=0.5 selects top 3
**Then** the result set includes at least one "dogs" entry (diversity)

## AC4: Temporal decay

**Given** two memories with identical relevance scores, one from 1 day ago and one from 60 days ago
**When** temporal decay is applied with half_life=30 days
**Then** the 1-day-old memory scores higher than the 60-day-old memory
**And** the 60-day-old memory score is approximately 25% of the 1-day-old (2^(-60/30) ≈ 0.25)

## AC5: Prompt injector

**Given** 3 memories of ~100 chars each
**When** I call `buildPromptContext(memories, maxTokens=50)`
**Then** it returns a string that fits within ~50 tokens (~200 chars)
**And** memories are formatted as markdown with relevance scores

## AC6: Embedding providers

**Given** an Ollama provider configured with model "nomic-embed-text"
**When** I call `embed("hello world")`
**Then** it returns a Float32Array of the configured dimensions

**Given** an OpenAI provider configured with model "text-embedding-3-small"
**When** I call `embed("hello world")`
**Then** it calls the OpenAI embeddings API and returns a Float32Array

## AC7: Memory tools

**Given** a memory_search tool registered in ToolRegistry
**When** called with `{ query: "animals", agent_name: "assistant" }`
**Then** it returns a ToolResult with matching memories

**Given** a memory_get tool registered in ToolRegistry
**When** called with `{ key: "greeting", agent_name: "assistant" }`
**Then** it returns a ToolResult with the memory content

## AC8: Config backward compatibility

**Given** an existing openAIOS.yml with only `memory.dir`
**When** loaded via `loadConfig()`
**Then** config loads successfully with new fields defaulted

## AC9: MockMemoryStore in testing

**Given** a test using MockMemoryStore
**When** calling store/search/get/delete
**Then** it works with in-memory data, no SQLite dependency
