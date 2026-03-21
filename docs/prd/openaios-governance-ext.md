# PRD: @openaios/governance extensions

## Problem Statement
The governance package only has basic tool allow/deny lists. It lacks DM pairing (binding channels to users), command approval workflows, per-agent path restrictions, rate limiting, and audit logging. These are needed before channels expansion (Step 6) and for enterprise deployments.

## Success Criteria
- DM pairing: 6-digit codes with TTL, verify/revoke
- Path policy: per-agent file path allow/deny patterns
- Rate limiter: token-bucket per agent
- Audit log: SQLite-backed, queryable, auto-prune
- Config additions fully optional
- All existing governance tests + new tests pass

## Scope
### In Scope
- pairing.ts, path-policy.ts, rate-limiter.ts, audit-log.ts
- Extended GovernanceAdapter interface (optional methods)
- Config schema extensions
- Integration into LocalGovernance checkPolicy
- MockAuditLog in testing

### Out of Scope
- Approval workflows (deferred — requires async turn holding)
- Secret management (deferred — needs secure storage design)
