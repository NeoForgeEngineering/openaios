import { z } from 'zod'

export const RoleDefinitionSchema = z.object({
  /** Unique role identifier */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Human-readable name */
  name: z.string(),
  /** Short description */
  description: z.string(),
  /** Base persona — injected into system prompt unless agent overrides */
  persona: z.string(),
  /** Tool permissions for this role */
  tools: z.object({
    allow: z.array(z.string()),
    deny: z.array(z.string()).default([]),
  }),
  /** Suggested default model tier */
  suggested_model: z.enum(['fast', 'standard', 'premium']).optional(),
  /** Capabilities */
  capabilities: z
    .object({
      browser: z.boolean().optional(),
      agent_calls: z.array(z.string()).optional(),
    })
    .optional(),
})

export type RoleDefinition = z.infer<typeof RoleDefinitionSchema>
