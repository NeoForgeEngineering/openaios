/**
 * @openaios/br-hook
 *
 * Claude Code hook integration for the Bot Resources control plane.
 *
 * This package provides hook handlers that are invoked by the Claude Code
 * hook system (PreToolUse, PostToolUse, Stop events) and forward events
 * to the BR API for audit logging and policy enforcement.
 *
 * Hook configuration in .claude/settings.json:
 *
 * {
 *   "hooks": {
 *     "PreToolUse": [{ "command": "npx openaios-hook pre-tool-use" }],
 *     "PostToolUse": [{ "command": "npx openaios-hook post-tool-use" }],
 *     "Stop": [{ "command": "npx openaios-hook stop" }]
 *   }
 * }
 *
 * Environment variables read by the hook:
 *   BR_URL    — Bot Resources API URL
 *   BR_TOKEN  — Bot Resources API token
 *   BR_AGENT  — Agent name (set by openaios runtime)
 */

export { runHook } from './hook-handler.js'
