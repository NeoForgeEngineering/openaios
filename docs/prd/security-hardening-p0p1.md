# PRD: Security Hardening P0+P1

## Problem Statement
Security audit identified 3 critical and 5 high severity vulnerabilities mirroring OpenClaw's CVE patterns (ClawJacked, path traversal, SSRF). The platform has zero authentication on dashboard/API, dead code in path policy enforcement, no SSRF protection, and no body size limits.

## Source
Full audit report: `docs/security-audit-2026-03-20.md`

## Fixes in scope

| ID | Severity | Fix |
|----|----------|-----|
| CRITICAL-1 | Critical | Add token auth to all dashboard/API endpoints |
| CRITICAL-2 | Critical | Same auth covers config PATCH |
| CRITICAL-3 | Critical | Enforce webhook secrets (auditor error, not warning) |
| MEDIUM-2 | Medium | Add CORS headers blocking cross-origin |
| HIGH-1 | High | Wire PathPolicy into start.ts, default to workspace-only |
| HIGH-3 | High | Block internal IPs, metadata endpoints, file:// in web_fetch |
| HIGH-5 | High | Add 1MB body size limit on all HTTP body parsers |

## Out of scope (P2+)
- HIGH-2: shell_exec command allowlist
- HIGH-4: Remove ExternalAgentRunner
- MEDIUM-1: WS token in message body
- MEDIUM-3: History compaction
