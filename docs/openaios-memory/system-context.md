# System Context — @openaios/memory (C4 Level 1)

```
┌───────────────────────────────────────────────────────┐
│                     OpenAIOS                           │
│                                                        │
│  ┌──────────┐   ┌──────────┐   ┌────────────────┐    │
│  │ Router   │──▶│ Runner   │──▶│ LLM API (ext)  │    │
│  │ Core     │   │ Adapter  │   └────────────────┘    │
│  └──────────┘   └──────────┘                          │
│       │              │                                 │
│       ▼              ▼                                 │
│  ┌──────────────────────────────────────────┐         │
│  │          @openaios/memory                 │         │
│  │  ┌─────────────┐  ┌──────────────────┐  │         │
│  │  │ MemoryStore │  │ Prompt Injector  │  │         │
│  │  │ (SQLite-vec)│  │ (token-budgeted) │  │         │
│  │  └─────────────┘  └──────────────────┘  │         │
│  │  ┌─────────────┐  ┌──────────────────┐  │         │
│  │  │ Hybrid      │  │ Embedding        │  │         │
│  │  │ Search      │  │ Providers        │  │         │
│  │  └─────────────┘  └──────────────────┘  │         │
│  └──────────────────────────────────────────┘         │
│       │              │              │                  │
│       ▼              ▼              ▼                  │
│  ┌────────┐   ┌──────────┐   ┌──────────────┐       │
│  │SQLite  │   │@openaios │   │Embedding APIs│       │
│  │+ vec   │   │/tools    │   │(OpenAI,      │       │
│  └────────┘   │(registry)│   │ Ollama, etc) │       │
│               └──────────┘   └──────────────┘       │
└───────────────────────────────────────────────────────┘
```

## External Systems

| System | Interaction | Protocol |
|--------|------------|----------|
| OpenAI Embeddings API | text-embedding-3-small/large | HTTPS |
| Ollama | nomic-embed-text, etc. | HTTP (local) |
| Voyage AI | voyage-3 | HTTPS |
| Mistral | mistral-embed | HTTPS |
| Google Gemini | text-embedding-004 | HTTPS |
| BR Platform | Centralized memory API | HTTPS |

## Key Relationships

- **MemoryStore** is instantiated at startup, passed to agents
- **Prompt Injector** called before each agent turn to build memory context
- **Tools** (memory_search, memory_get) registered into @openaios/tools ToolRegistry
- **Embedding Provider** selected at config time, one provider per deployment
