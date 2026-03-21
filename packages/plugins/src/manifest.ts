import { z } from 'zod'

export const PluginManifestSchema = z.object({
  /** Unique plugin name (lowercase, hyphens) */
  name: z
    .string()
    .regex(
      /^[a-z0-9-]+$/,
      'Plugin name must be lowercase alphanumeric with hyphens',
    ),
  /** Human-readable display name */
  displayName: z.string(),
  /** Plugin version (semver) */
  version: z.string(),
  /** Short description */
  description: z.string(),
  /** Plugin author */
  author: z.string().optional(),
  /** Entry point module path (relative to plugin dir) */
  main: z.string().default('index.js'),
  /** What the plugin provides */
  provides: z
    .object({
      tools: z.array(z.string()).default([]),
      channels: z.array(z.string()).default([]),
      hooks: z.array(z.string()).default([]),
    })
    .default({}),
  /** Required openAIOS version range */
  openaiosVersion: z.string().optional(),
  /** Plugin-specific config schema (JSON Schema) */
  configSchema: z.record(z.string(), z.unknown()).optional(),
})

export type PluginManifest = z.infer<typeof PluginManifestSchema>

export function validateManifest(data: unknown): PluginManifest {
  return PluginManifestSchema.parse(data)
}
