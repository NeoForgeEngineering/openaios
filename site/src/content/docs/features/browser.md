---
title: Browser Automation
description: Headless browser control with navigate, click, fill, screenshot, and snapshot tools.
sidebar:
  order: 5
---

The `@openaios/browser` package provides agents with **governed browser automation** via the `agent-browser` CLI.

## Tools

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL (governance-checked) |
| `browser_snapshot` | Get the page's accessibility tree as text |
| `browser_click` | Click an element by CSS selector |
| `browser_fill` | Fill a form field |
| `browser_screenshot` | Take a screenshot (returns base64 PNG) |

## Configuration

Enable browser for an agent with a boolean or detailed config:

```yaml
agents:
  - name: researcher
    capabilities:
      browser: true              # simple: use defaults

  - name: scraper
    capabilities:
      browser:                    # detailed: custom policies
        url_allowlist:
          - "https://docs.example.com/**"
        url_denylist:
          - "https://admin.example.com/**"
        session_timeout_seconds: 600
```

## URL Governance

Every `browser_navigate` call is checked against URL allowlists and denylists before the browser navigates. Deny rules take precedence.

```
navigate("https://docs.example.com/page")  → allowed
navigate("https://admin.example.com/")     → denied by policy
navigate("https://random.com/")            → denied (not in allowlist)
```

## Session Management

Each agent gets an isolated browser session. Sessions auto-expire after the configured timeout (default 5 minutes of inactivity). The `BrowserSessionManager` tracks active sessions and cleans up expired ones.

## Prerequisites

The `agent-browser` CLI must be installed and available in `$PATH`. It provides a headless Chromium instance optimized for AI agents (93% fewer tokens than raw Playwright).
