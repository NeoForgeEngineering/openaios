# Edge Cases — @openaios/memory

## Empty/Null
- Search on empty store: returns `[]`
- buildPromptContext with no memories: returns empty string
- Store with empty content: rejected by validation
- Store with empty key: rejected by validation

## Boundary
- Very large content (>100KB): stored but embedding truncated to provider max
- maxTokens=0 in buildPromptContext: returns empty string
- top_k=1: returns single best result
- dimensions mismatch (stored vs current config): error on search

## Invalid
- Non-existent agent name in search: returns `[]` (not error)
- Invalid embedding provider name: caught at config validation
- Missing API key for paid providers: throws at embed time

## Timing
- Embedding API timeout: 30s timeout, throws, turn continues without memory
- Concurrent store operations: SQLite WAL mode handles concurrency

## Failure
- sqlite-vec not loadable: throws at init with clear error message
- Embedding API returns 429: throws (no retry — agent retries at turn level)
- Corrupted embedding BLOB: skipped in search results with warning

## Concurrent
- Multiple agents storing simultaneously: safe (WAL mode + agent scoping)
- Search during store: safe (read doesn't block writes in WAL)
