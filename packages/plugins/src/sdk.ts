/**
 * SDK exports for plugin authors.
 * Plugins import from '@openaios/plugins/sdk' to access
 * types and helpers for building plugins.
 */

// Re-export core types plugin authors need
export type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from '@openaios/core'
export type { PluginInstance, PluginState } from './lifecycle.js'
export type { LoadedPlugin } from './loader.js'
export type { PluginManifest } from './manifest.js'
export type { LoadedSkill } from './skill-loader.js'
