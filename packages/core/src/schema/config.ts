import { z } from 'zod'

/** Resolves ${ENV_VAR} references in string values */
function envString() {
  return z.string().transform((val) => {
    return val.replace(/\$\{([^}]+)\}/g, (_, name) => {
      const v = process.env[name]
      if (v === undefined) {
        throw new Error(`Environment variable ${name} is not set`)
      }
      return v
    })
  })
}

const AgentPermissionsSchema = z.object({
  /** Tools explicitly allowed — deny-by-default if omitted entirely */
  allow: z.array(z.string()).default([]),
  /** Tools explicitly denied — takes precedence over allow */
  deny: z.array(z.string()).default([]),
})

const RunnerConfigSchema = z.object({
  /** Execution mode for this agent's runner */
  mode: z.enum(['native', 'docker']).default('native'),
  /** Docker config — only used when mode is 'docker' */
  docker: z
    .object({
      image: z.string().default('node:22-slim'),
      memory: z.string().optional(), // e.g. "512m"
      cpus: z.number().optional(),
    })
    .optional(),
})

const AgentModelSchema = z.object({
  /** Default model — used for most requests */
  default: z.string(),
  /** Premium model — escalated for complex tasks */
  premium: z.string().optional(),
})

const TelegramChannelSchema = z.object({
  token: envString(),
})

const DiscordChannelSchema = z.object({
  token: envString(),
  /** Guild (server) ID */
  guildId: z.string().optional(),
})

const WebhookChannelSchema = z.object({
  /** Path to mount the webhook on */
  path: z.string().default('/webhook'),
  /** Secret for verifying incoming requests */
  secret: envString().optional(),
})

const AgentChannelsSchema = z.object({
  telegram: TelegramChannelSchema.optional(),
  discord: DiscordChannelSchema.optional(),
  webhook: WebhookChannelSchema.optional(),
})

const CapabilitiesSchema = z.object({
  /** Provision a Chromium CDP sidecar for browser automation */
  browser: z.boolean().default(false),
  /** List of agent names this agent is permitted to call via the agent bus */
  'agent-calls': z.array(z.string()).default([]),
})

const AgentSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Agent name must be lowercase alphanumeric with hyphens'),
  /** Inline persona string or path to a CLAUDE.md file */
  persona: z.string().default('You are a helpful assistant.'),
  model: AgentModelSchema,
  channels: AgentChannelsSchema,
  permissions: AgentPermissionsSchema.default({}),
  runner: RunnerConfigSchema.default({}),
  capabilities: CapabilitiesSchema.default({}),
})

const OllamaProviderSchema = z.object({
  base_url: z.string().default('http://localhost:11434'),
})

const ApiKeyProviderSchema = z.object({
  api_key: envString(),
  base_url: z.string().optional(),
})

const ClaudeCodeProviderSchema = z.object({
  /** Path to claude binary — defaults to searching PATH */
  bin: z.string().default('claude'),
})

const ModelProvidersSchema = z.object({
  ollama: OllamaProviderSchema.optional(),
  anthropic: ApiKeyProviderSchema.optional(),
  groq: ApiKeyProviderSchema.optional(),
  openai: ApiKeyProviderSchema.optional(),
  openrouter: ApiKeyProviderSchema.optional(),
  'claude-code': ClaudeCodeProviderSchema.optional(),
})

const AgentBudgetSchema = z.object({
  limit: z.number().positive(),
  /** Fraction of limit at which to warn (0.0–1.0) */
  warning_at: z.number().min(0).max(1).default(0.8),
  /** Action when limit is exceeded */
  on_exceeded: z.enum(['block', 'downgrade', 'warn']).default('warn'),
  /** Model to downgrade to when on_exceeded is 'downgrade' */
  downgrade_to: z.string().optional(),
})

const BudgetSchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly']).default('monthly'),
  agents: z.record(z.string(), AgentBudgetSchema).default({}),
})

const BRGovernanceSchema = z.object({
  url: envString(),
  token: envString(),
  /** Whether to fail-secure (block) if BR is unreachable. Default: fail-open (allow). */
  fail_secure: z.boolean().default(false),
})

const GovernanceSchema = z.object({
  br: BRGovernanceSchema.optional(),
})

const NetworkSchema = z.object({
  /** Interface to bind — 'tailscale' resolves the Tailscale IP automatically */
  bind: z.union([z.literal('tailscale'), z.literal('localhost'), z.string()]).default('tailscale'),
  /** Port for webhook/web-chat channels */
  port: z.number().int().default(3000),
  /** Port for the internal agent bus HTTP server (0 = random) */
  bus_port: z.number().int().default(0),
})

const DataSchema = z.object({
  /** Base directory for all runtime data (sessions, SQLite) — relative to CWD */
  dir: z.string().default('./data'),
})

const MemorySchema = z.object({
  /** Shared markdown memory directory — accessible by all agents via file tools */
  dir: z.string().default('./data/memory'),
})

export const ConfigSchema = z.object({
  agents: z.array(AgentSchema).min(1, 'At least one agent must be configured'),
  models: z
    .object({
      providers: ModelProvidersSchema,
    })
    .optional(),
  budget: BudgetSchema.optional(),
  governance: GovernanceSchema.optional(),
  network: NetworkSchema.default({}),
  data: DataSchema.default({}),
  memory: MemorySchema.default({}),
})

export type Config = z.infer<typeof ConfigSchema>
export type AgentConfig = z.infer<typeof AgentSchema>
export type AgentBudgetConfig = z.infer<typeof AgentBudgetSchema>
export type RunnerConfig = z.infer<typeof RunnerConfigSchema>
export type ModelProviders = z.infer<typeof ModelProvidersSchema>
export type AgentCapabilities = z.infer<typeof CapabilitiesSchema>
