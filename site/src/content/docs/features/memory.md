---
title: Semantic Memory
description: SQLite-vec backed semantic memory with hybrid search, MMR reranking, and prompt injection.
sidebar:
  order: 2
---

The `@openaios/memory` package gives agents **long-term semantic memory** — store facts, search by meaning, and automatically inject relevant context into agent prompts.

## Architecture

- **SQLite + sqlite-vec** for vector storage (no external database needed)
- **FTS5** full-text search for keyword matching
- **Hybrid search** merges vector similarity + BM25 text relevance via Reciprocal Rank Fusion
- **MMR reranking** ensures diversity in results
- **Temporal decay** weights recent memories higher

## Configuration

```yaml
memory:
  dir: ./data/memory              # SQLite database location
  provider: ollama                # openai | ollama | voyage | mistral | gemini
  model: nomic-embed-text         # embedding model
  # api_key: ${OPENAI_API_KEY}   # required for cloud providers
  # base_url: http://localhost:11434  # for self-hosted
  # dimensions: 768               # vector dimensions (auto-detected)
  top_k: 5                        # results to inject per turn
  decay_half_life_days: 30         # older memories score lower
```

:::note
When no `provider` is configured, semantic memory is disabled. Agents still have access to the shared markdown memory directory.
:::

## Embedding providers

| Provider | Model | Key required |
|----------|-------|-------------|
| `ollama` | nomic-embed-text, mxbai-embed-large | No (local) |
| `openai` | text-embedding-3-small/large | Yes |
| `voyage` | voyage-3 | Yes |
| `mistral` | mistral-embed | Yes |
| `gemini` | text-embedding-004 | Yes |

## Memory tools

When memory is enabled, two tools are automatically registered:

| Tool | Description |
|------|-------------|
| `memory_search` | Search memories by semantic query |
| `memory_get` | Retrieve a specific memory by key |

Agents can also store memories programmatically through the MemoryAdapter interface.

## How search works

1. Query text is embedded via the configured provider
2. **FTS5 BM25** finds keyword matches
3. **Vector cosine similarity** finds semantic matches
4. Results are merged via **Reciprocal Rank Fusion** (RRF)
5. **MMR reranking** balances relevance vs diversity
6. **Temporal decay** applies `score *= 2^(-age_days / half_life)`
7. Top-K results are formatted and injected into the agent's system prompt

## Per-agent isolation

Memories are scoped by agent name. Agent "assistant" cannot see memories stored by agent "researcher". This is enforced at the database query level.
