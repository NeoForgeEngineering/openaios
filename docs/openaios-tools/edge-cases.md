# Edge Cases — @openaios/tools

## Empty/Null
- Registry with no tools: `list()` returns `[]`, `get()` returns `undefined`
- Execute with empty input: tool's inputSchema validation should catch
- Tool with empty name string: should be rejected at registration

## Boundary
- Registry with 1000+ tools: Map lookup remains O(1)
- Tool name with special characters: only alphanumeric + underscore + hyphen allowed
- URL allowlist with glob patterns: `*` matches any path segment

## Invalid
- Duplicate tool registration: throws Error
- Execute non-existent tool: returns error ToolResult (no governance call)
- Malformed URL in web-fetch: returns error ToolResult
- Invalid search provider name: caught at config validation

## Timing
- Governance timeout during execute: fail-open (governance's 200ms timeout)
- Tool execution timeout: no built-in timeout (tools manage own timeouts)

## Failure
- web-fetch network error: returns error ToolResult with message
- web-search API returns non-200: returns error ToolResult
- pdf-parse on non-PDF content: returns error ToolResult
- Tool execute throws non-Error: caught and wrapped

## Concurrent
- Multiple simultaneous executions of same tool: safe (tools are stateless)
- Registry mutation during iteration: `list()` returns snapshot copy
