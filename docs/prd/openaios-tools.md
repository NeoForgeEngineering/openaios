# PRD: @openaios/tools

## Problem Statement

OpenAIOS agents currently have no way to execute tools (web fetch, search, PDF parsing, image analysis) through a governed, auditable interface. The runner layer delegates everything to the LLM runtime (e.g. Claude Code's built-in tools), but there's no registry for custom tools, no governance-checked execution, and no way for other packages (memory, browser, plugins) to register their own tools into a shared catalog.

## Target Users

1. **Agent operators** — configure which tools agents can access via `openAIOS.yml`
2. **Package authors** — register tools from `@openaios/memory`, `@openaios/browser`, `@openaios/plugins`
3. **Enterprise admins (BR)** — manage tool catalogs and enforce tool policies centrally

## Success Criteria

- Tool registry supports add/get/list/remove with O(1) lookup by name
- Every tool execution passes through governance (`checkPolicy`) before running
- Built-in tools (web-fetch, web-search, pdf-parse, image-analyze) work standalone
- Config additions are fully optional — existing `openAIOS.yml` files remain valid
- MockToolRegistry available in `@openaios/core/testing` for downstream packages
- All tests pass with `node:test` + `assert/strict`

## Scope

### In Scope
- `ToolDefinition`, `ToolContext`, `ToolResult` interfaces in `@openaios/core`
- `ToolRegistry` class (CRUD for tool definitions)
- `ToolExecutor` governance-checked execution wrapper
- Built-in tools: web-fetch, web-search, pdf-parse, image-analyze
- Config schema: `tools.search_provider`, `tools.search_api_key`, `tools.url_allowlist`, `tools.url_denylist`
- BR hook: `tools.br: { url, token }` for managed tool catalogs
- Mock for testing

### Out of Scope
- Tool UI/dashboard
- MCP (Model Context Protocol) tool bridging — future package
- Per-agent tool configuration beyond existing `permissions.allow/deny`
- Tool result caching
