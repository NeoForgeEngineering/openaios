# Acceptance Criteria — @openaios/governance extensions

## AC1: DM Pairing
**Given** a PairingManager
**When** I call `createCode("assistant")`
**Then** it returns a 6-digit numeric string
**And** `verify("assistant", code)` returns true before TTL expires
**And** `verify("assistant", code)` returns false after TTL expires

**Given** a verified pairing
**When** I call `revoke("assistant", code)`
**Then** `verify("assistant", code)` returns false

## AC2: Path Policy
**Given** a PathPolicy with allow `["/workspace/*"]` and deny `["/workspace/.env"]`
**When** checking `/workspace/file.ts` → allowed
**When** checking `/workspace/.env` → denied (deny takes precedence)
**When** checking `/etc/passwd` → denied (not in allow)

## AC3: Rate Limiter
**Given** a RateLimiter with capacity=5, refillPerSecond=1
**When** I consume 5 tokens immediately → all succeed
**When** I try a 6th immediately → denied
**When** I wait 1 second and try → allowed (refilled 1 token)

## AC4: Audit Log
**Given** an AuditLog
**When** I call `log(event)` → event is persisted to SQLite
**When** I call `query({ agentName: "assistant" })` → returns matching events
**When** I call `prune(olderThanDays: 30)` → removes old entries

## AC5: Config backward compatibility
**Given** existing openAIOS.yml with no governance extensions
**When** loaded → all new fields default safely

## AC6: Integration
**Given** LocalGovernance with rate_limits and path policies configured
**When** checkPolicy is called with a tool that accesses a denied path → denied
**When** checkPolicy is called and rate limit is exceeded → denied
