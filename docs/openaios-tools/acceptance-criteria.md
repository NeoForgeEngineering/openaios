# Acceptance Criteria — @openaios/tools

## AC1: ToolRegistry CRUD

**Given** an empty ToolRegistry
**When** I add a ToolDefinition with name "web_fetch"
**Then** `registry.has("web_fetch")` returns true
**And** `registry.get("web_fetch")` returns the definition
**And** `registry.list()` contains exactly one entry

**Given** a ToolRegistry with "web_fetch" registered
**When** I add another ToolDefinition with name "web_fetch"
**Then** it throws an Error with message containing "already registered"

**Given** a ToolRegistry with "web_fetch" registered
**When** I call `registry.remove("web_fetch")`
**Then** it returns true
**And** `registry.has("web_fetch")` returns false

**Given** a ToolRegistry with no "foo" tool
**When** I call `registry.remove("foo")`
**Then** it returns false

## AC2: ToolExecutor governance flow

**Given** a ToolExecutor with a registered "web_fetch" tool and governance set to ALLOW
**When** I call `executor.execute("web_fetch", { url: "https://example.com" }, ctx)`
**Then** governance.checkPolicy is called with `{ agentName, sessionKey, tool: "web_fetch", input: { url: "..." } }`
**And** the tool's execute function is called
**And** governance.reportToolUse is called
**And** the ToolResult is returned

**Given** a ToolExecutor with governance set to DENY
**When** I call `executor.execute("web_fetch", input, ctx)`
**Then** governance.checkPolicy is called
**And** the tool's execute function is NOT called
**And** the result is `{ type: "error", content: "..." }` with the denial reason

**Given** a ToolExecutor
**When** I call `executor.execute("nonexistent", input, ctx)`
**Then** it returns `{ type: "error", content: "Tool not found: nonexistent" }`
**And** governance is NOT consulted

**Given** a ToolExecutor with a tool that throws during execution
**When** I call `executor.execute("bad_tool", input, ctx)`
**Then** it returns `{ type: "error", content: "..." }` with the error message
**And** governance.reportToolUse is still called (with error info)

## AC3: Built-in web-fetch

**Given** web-fetch tool with url_allowlist `["https://example.com/*"]`
**When** called with `{ url: "https://example.com/page" }`
**Then** it fetches the URL and returns `{ type: "text", content: "<body text>" }`

**Given** web-fetch tool with url_denylist `["https://evil.com/*"]`
**When** called with `{ url: "https://evil.com/page" }`
**Then** it returns `{ type: "error", content: "URL denied by policy" }`

## AC4: Built-in web-search

**Given** web-search tool configured with search_provider "brave"
**When** called with `{ query: "test" }`
**Then** it calls the Brave Search API
**And** returns `{ type: "json", content: [{ title, url, snippet }] }`

## AC5: Config backward compatibility

**Given** an existing openAIOS.yml with no `tools:` section
**When** loaded via `loadConfig()`
**Then** config loads successfully with tools as undefined

## AC6: MockToolRegistry in testing

**Given** a test importing from `@openaios/core/testing`
**When** using MockToolRegistry
**Then** it implements ToolRegistry interface with in-memory Map
**And** tracks all calls for assertion
