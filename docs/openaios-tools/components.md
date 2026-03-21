# Component Architecture — @openaios/tools (C4 Level 3)

## Package: `packages/tools/src/`

### registry.ts — ToolRegistry
- `add(tool: ToolDefinition): void` — register tool (throws on duplicate)
- `get(name: string): ToolDefinition | undefined` — O(1) lookup by name
- `list(): ToolDefinition[]` — all registered tools
- `remove(name: string): boolean` — unregister tool
- `has(name: string): boolean` — existence check
- Internal: `Map<string, ToolDefinition>`

### executor.ts — ToolExecutor
- Constructor: `(registry: ToolRegistry, governance: GovernanceAdapter)`
- `execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult>`
  1. Get tool from registry (error if not found)
  2. `governance.checkPolicy({ agentName, sessionKey, tool: name, input })`
  3. If denied → return error ToolResult
  4. `tool.execute(input, ctx)` with try/catch
  5. `governance.reportToolUse(event)` fire-and-forget
  6. Return result

### built-in/web-fetch.ts
- Fetch URL with configurable allowlist/denylist
- Returns text content (HTML stripped or raw)
- Respects `tools.url_allowlist` / `tools.url_denylist`

### built-in/web-search.ts
- Abstraction over Brave/SearXNG/Tavily
- Factory pattern based on `tools.search_provider`
- Returns JSON array of search results

### built-in/pdf-parse.ts
- PDF text extraction using `pdf-parse` npm package
- Input: URL or base64 content
- Returns extracted text

### built-in/image-analyze.ts
- Vision API image analysis
- Delegates to configured LLM with vision capability
- Returns text description

## Package: `packages/core/src/`

### interfaces/tool.ts (new)
- `ToolDefinition` — name, description, inputSchema (Zod), execute function
- `ToolContext` — sessionKey, agentName, workspaceDir
- `ToolResult` — type (text|json|image|error), content

### schema/config.ts (extend)
- `ToolsSchema` — search_provider, search_api_key, url_allowlist, url_denylist, br

### testing/index.ts (extend)
- `MockToolRegistry` — in-memory registry for tests
