# PRD: @openaios/browser

## Problem Statement
OpenAIOS agents have a `capabilities.browser` flag but no actual browser automation package. Agents need to navigate web pages, take snapshots, click elements, fill forms, and take screenshots — all through a governed, tool-registered interface.

## Success Criteria
- Browser session manager with per-agent isolation
- Agent-browser CLI wrapper (spawns subprocess)
- 5 browser tools: navigate, snapshot, click, fill, screenshot
- URL governance (allowlist/denylist enforcement)
- Config extends capabilities.browser to support detailed options
- Tools register into @openaios/tools ToolRegistry
- All tests pass

## Scope
### In Scope
- BrowserSession manager (lifecycle, per-agent)
- AgentBrowserClient (subprocess wrapper)
- Browser tools (navigate, snapshot, click, fill, screenshot)
- URL governance layer
- Config schema extension

### Out of Scope
- Managed browser pools (BR feature)
- PDF generation from browser
- Browser extension support
