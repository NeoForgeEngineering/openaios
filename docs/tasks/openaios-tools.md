# Tasks: @openaios/tools

## Task Breakdown (session-sized, ordered by dependency)

### T1: Core interfaces + config schema
- Add `packages/core/src/interfaces/tool.ts` (ToolDefinition, ToolContext, ToolResult)
- Extend `packages/core/src/schema/config.ts` with ToolsSchema
- Export from `packages/core/src/index.ts`
- Add MockToolRegistry to `packages/core/src/testing/index.ts`
- Build core to verify

### T2: Package scaffolding + registry
- Create `packages/tools/` with package.json, tsconfig.json
- Implement `registry.ts` (ToolRegistry class)
- Write registry tests (add, get, list, remove, duplicate)

### T3: Executor with governance
- Implement `executor.ts` (ToolExecutor)
- Write executor tests (allow flow, deny flow, tool not found, execution error)

### T4: Built-in tools
- Implement web-fetch.ts (URL allowlist/denylist)
- Implement web-search.ts (Brave/SearXNG/Tavily)
- Implement pdf-parse.ts
- Implement image-analyze.ts
- Write tests for each (mocked HTTP)

### T5: CLI integration
- Add `setupTools()` helper in `packages/cli/src/commands/start.ts`
- Wire ToolRegistry creation + built-in registration at startup
- Verify full build + existing tests pass
