# Container Architecture — @openaios/tools (C4 Level 2)

## Containers

### 1. `packages/tools/` (new npm package)
- **Purpose:** Tool registry, executor, built-in tools
- **Technology:** TypeScript, node:test
- **Dependencies:** `@openaios/core` (interfaces, governance types)

### 2. `packages/core/` (modified)
- **Purpose:** New `ToolDefinition`, `ToolContext`, `ToolResult` interfaces + config schema additions
- **Changes:** New interface file, schema extensions, testing mock, index exports

### 3. `packages/cli/` (modified)
- **Purpose:** Instantiate ToolRegistry + register built-ins at startup
- **Changes:** `start.ts` gets `setupTools()` helper

## Dependency Map

```
@openaios/tools
  └── @openaios/core (interfaces, config schema, governance types)

@openaios/cli
  ├── @openaios/tools (instantiation)
  └── @openaios/core (config)
```

## Data Flow

1. CLI `start.ts` → creates `ToolRegistry` → registers built-in tools
2. Other packages call `registry.add(toolDef)` to register their tools
3. Agent turn → tool invocation → `ToolExecutor.execute(toolName, input, ctx)`
4. Executor: `registry.get(name)` → `governance.checkPolicy()` → `tool.execute()` → `governance.reportToolUse()`
5. BR mode: registry merges remote catalog on startup, syncs periodically
