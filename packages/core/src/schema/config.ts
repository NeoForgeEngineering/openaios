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

// LLM runtime type
const RunnerLlmSchema = z
  .enum(['claude-code', 'openai-compat', 'gemini', 'ollama'])
  .default('claude-code')

/** Config passed to claude CLI via env vars for non-claude-code LLMs */
const LlmConfigSchema = z.object({
  /** ANTHROPIC_BASE_URL — points to Anthropic-compat gateway (LiteLLM, claude-code-router, etc) */
  base_url: z.string(),
  /** ANTHROPIC_AUTH_TOKEN — API key for the gateway */
  api_key: z.string().optional(),
})

/** Explicit opt-in required for native mode (agents run on host — broader access) */
const NativeSafeguardSchema = z.object({
  allow_host_access: z.literal(true),
})

const DockerContainerConfigSchema = z.object({
  image: z.string().default('node:22-slim'),
  memory: z.string().optional(), // e.g. "512m"
  cpus: z.number().optional(),
})

/** Config for external agent runners (openclaw, LiteLLM, any OpenAI-compat endpoint) */
const ExternalRunnerConfigSchema = z.object({
  /** OpenAI-compat chat completions base URL, e.g. http://localhost:18789/v1 */
  base_url: z.string(),
  /** API key presented as Bearer token (optional) */
  api_key: envString().optional(),
})

const RunnerConfigSchema = z.object({
  /** WHERE the agent runs */
  env: z.enum(['docker', 'native', 'external']).default('docker'),
  /** WHICH LLM drives the agentic loop */
  llm: RunnerLlmSchema,
  /** Gateway config — required when llm !== 'claude-code' */
  llm_config: LlmConfigSchema.optional(),
  /** Must be set to explicitly allow native agents to access the host */
  native: NativeSafeguardSchema.optional(),
  /** Docker container config */
  docker: DockerContainerConfigSchema.optional(),
  /** External agent config — required when env === 'external' */
  external: ExternalRunnerConfigSchema.optional(),
})

const ReasoningModeSchema = z
  .enum(['standard', 'fast', 'deep'])
  .default('standard')

const AuthProfileSchema = z.object({
  key: envString(),
  provider: z.string().optional(),
})

const AgentModelSchema = z.object({
  /** Default model — used for most requests */
  default: z.string(),
  /** Premium model — escalated for complex tasks */
  premium: z.string().optional(),
  /** Reasoning mode: standard, fast, or deep */
  reasoning: ReasoningModeSchema.optional(),
  /** API key rotation profiles */
  auth_profiles: z.array(AuthProfileSchema).optional(),
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

const SlackChannelSchema = z.object({
  token: envString(),
  app_token: envString(),
  signing_secret: envString().optional(),
})

const WhatsAppChannelSchema = z.object({
  session_name: z.string().optional(),
})

const SignalChannelSchema = z.object({
  phone_number: z.string(),
  bin: z.string().optional(),
})

const IMessageChannelSchema = z.object({
  poll_interval_ms: z.number().int().positive().optional(),
})

const GoogleChatChannelSchema = z.object({
  path: z.string().default('/google-chat'),
  project_id: z.string().optional(),
  credentials_path: z.string().optional(),
})

const GroupRoutingSchema = z.object({
  /** Require bot mention in group chats */
  require_mention: z.boolean().default(true),
})

const DmAllowlistSchema = z.object({
  /** User IDs allowed to DM this agent */
  user_ids: z.array(z.string()).default([]),
})

const AgentChannelsSchema = z.object({
  telegram: TelegramChannelSchema.optional(),
  discord: DiscordChannelSchema.optional(),
  webhook: WebhookChannelSchema.optional(),
  slack: SlackChannelSchema.optional(),
  whatsapp: WhatsAppChannelSchema.optional(),
  signal: SignalChannelSchema.optional(),
  imessage: IMessageChannelSchema.optional(),
  google_chat: GoogleChatChannelSchema.optional(),
  /** Group routing configuration */
  group_routing: GroupRoutingSchema.optional(),
  /** DM allowlist */
  dm_allowlist: DmAllowlistSchema.optional(),
})

const BrowserCapabilitySchema = z.object({
  /** URL allowlist for browser navigation */
  url_allowlist: z.array(z.string()).optional(),
  /** URL denylist for browser navigation */
  url_denylist: z.array(z.string()).optional(),
  /** Max screenshots per agent turn */
  max_screenshots_per_turn: z.number().int().positive().optional(),
  /** Session timeout in seconds */
  session_timeout_seconds: z.number().int().positive().default(300),
})

const CapabilitiesSchema = z.object({
  /** Provision browser automation — true for defaults, or object for detailed config */
  browser: z.union([z.boolean(), BrowserCapabilitySchema]).default(false),
  /** List of agent names this agent is permitted to call via the agent bus */
  'agent-calls': z.array(z.string()).default([]),
})

const AgentSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-z0-9-]+$/,
      'Agent name must be lowercase alphanumeric with hyphens',
    ),
  /** Role — resolves persona, tools, and capabilities from role definition */
  role: z.string().optional(),
  /** Inline persona string or path to a CLAUDE.md file (overrides role persona) */
  persona: z.string().default('You are a helpful assistant.'),
  model: AgentModelSchema,
  channels: AgentChannelsSchema,
  permissions: AgentPermissionsSchema.default({}),
  runner: RunnerConfigSchema.default({}),
  capabilities: CapabilitiesSchema.default({}),
  /** Skills to load — each maps to {skills.dir}/{name}/SKILL.md injected into system prompt */
  skills: z.array(z.string()).default([]),
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

const PathPolicySchema = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
})

const RateLimitSchema = z.object({
  capacity: z.number().int().positive(),
  refill_per_second: z.number().positive(),
})

const PairingSchema = z.object({
  /** TTL for pairing codes in seconds */
  ttl_seconds: z.number().int().positive().default(300),
})

const AuditSchema = z.object({
  /** Auto-prune entries older than this many days */
  prune_after_days: z.number().int().positive().default(90),
})

const GovernanceSchema = z.object({
  br: BRGovernanceSchema.optional(),
  /** Per-agent file path restrictions */
  paths: z.record(z.string(), PathPolicySchema).optional(),
  /** Per-agent rate limits */
  rate_limits: z.record(z.string(), RateLimitSchema).optional(),
  /** DM pairing configuration */
  pairing: PairingSchema.optional(),
  /** Audit logging configuration */
  audit: AuditSchema.optional(),
})

const GatewaySchema = z.object({
  /** Enable WebSocket gateway */
  enabled: z.boolean().default(false),
  /** Auth token for WS connections */
  auth_token: envString().optional(),
})

const FederationPeerSchema = z.object({
  node_id: z.string(),
  /** Full bus URL of the peer, e.g. http://100.x.x.x:4000 */
  bus_url: envString(),
  /** Token this node presents when calling the peer */
  token: envString(),
  /** Agent names hosted on this peer node */
  agents: z.array(z.string()).default([]),
})

const FederationSchema = z.object({
  node_id: z.string(),
  /** Token peer nodes must present when calling into this node */
  inbound_token: envString(),
  peers: z.array(FederationPeerSchema).default([]),
})

const NetworkSchema = z.object({
  /** Interface to bind — 'tailscale' resolves the Tailscale IP automatically */
  bind: z
    .union([z.literal('tailscale'), z.literal('localhost'), z.string()])
    .default('tailscale'),
  /** Port for webhook/web-chat channels */
  port: z.number().int().default(3000),
  /** Port for the internal agent bus HTTP server (0 = random) */
  bus_port: z.number().int().default(0),
  /** Register agent containers on the Tailscale network via tsdproxy */
  tsdproxy: z.boolean().default(false),
  /** Admin token for dashboard/API authentication. Required for non-localhost binds. */
  admin_token: envString().optional(),
})

const DataSchema = z.object({
  /** Base directory for all runtime data (sessions, SQLite) — relative to CWD */
  dir: z.string().default('./data'),
})

const MemoryBRSchema = z.object({
  /** BR platform URL for centralized memory */
  url: envString(),
  /** Authentication token */
  token: envString(),
})

const MemorySchema = z.object({
  /** Shared markdown memory directory — accessible by all agents via file tools */
  dir: z.string().default('./data/memory'),
  /** Embedding provider */
  provider: z
    .enum(['openai', 'ollama', 'voyage', 'mistral', 'gemini'])
    .optional(),
  /** Embedding model name */
  model: z.string().optional(),
  /** API key for the embedding provider */
  api_key: envString().optional(),
  /** Base URL for the embedding provider (e.g. Ollama) */
  base_url: z.string().optional(),
  /** Vector dimensions */
  dimensions: z.number().int().positive().optional(),
  /** Number of results to inject into prompt */
  top_k: z.number().int().positive().default(5),
  /** Temporal decay half-life in days */
  decay_half_life_days: z.number().positive().default(30),
  /** BR platform integration for centralized memory */
  br: MemoryBRSchema.optional(),
})

const VoiceSchema = z.object({
  tts: z
    .object({
      provider: z.enum(['elevenlabs', 'edge-tts', 'openai-tts', 'system']),
      api_key: envString().optional(),
      voice: z.string().optional(),
    })
    .optional(),
  stt: z
    .object({
      provider: z.enum(['deepgram', 'whisper']),
      api_key: envString().optional(),
      model: z.string().optional(),
    })
    .optional(),
})

const SkillsSchema = z.object({
  /** Directory containing skill subdirectories with SKILL.md files */
  dir: z.string().default('~/.openclaw/skills'),
})

const CronJobSchema = z.object({
  name: z.string(),
  agent: z.string(),
  schedule: z.string(),
  message: z.string(),
})

const AutomationWebhookSchema = z.object({
  path: z.string(),
  agent: z.string(),
  token: envString().optional(),
})

const AutomationSchema = z.object({
  cron: z
    .object({
      jobs: z.array(CronJobSchema).default([]),
    })
    .optional(),
  webhooks: z
    .object({
      paths: z.array(AutomationWebhookSchema).default([]),
    })
    .optional(),
})

const ToolsBRSchema = z.object({
  /** BR platform URL for managed tool catalog */
  url: envString(),
  /** Authentication token */
  token: envString(),
})

const ToolsSchema = z.object({
  /** Search provider for web-search tool */
  search_provider: z.enum(['brave', 'searxng', 'tavily']).optional(),
  /** API key for the search provider */
  search_api_key: envString().optional(),
  /** Glob patterns of allowed URLs for web-fetch */
  url_allowlist: z.array(z.string()).optional(),
  /** Glob patterns of denied URLs for web-fetch */
  url_denylist: z.array(z.string()).optional(),
  /** BR platform integration for managed tool catalogs */
  br: ToolsBRSchema.optional(),
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
  skills: SkillsSchema.default({}),
  tools: ToolsSchema.optional(),
  voice: VoiceSchema.optional(),
  automation: AutomationSchema.optional(),
  gateway: GatewaySchema.optional(),
  federation: FederationSchema.optional(),
})

export type Config = z.infer<typeof ConfigSchema>
/** Full agent definition as parsed from openAIOS.yml */
export type AgentDefinition = z.infer<typeof AgentSchema>
export type AgentBudgetConfig = z.infer<typeof AgentBudgetSchema>
export type RunnerConfig = z.infer<typeof RunnerConfigSchema>
export type RunnerLlm = z.infer<typeof RunnerLlmSchema>
export type LlmConfig = z.infer<typeof LlmConfigSchema>
export type ExternalRunnerConfig = z.infer<typeof ExternalRunnerConfigSchema>
export type ModelProviders = z.infer<typeof ModelProvidersSchema>
export type AgentCapabilities = z.infer<typeof CapabilitiesSchema>
export type AutomationConfig = z.infer<typeof AutomationSchema>
export type GovernanceConfig = z.infer<typeof GovernanceSchema>
export type MemoryConfig = z.infer<typeof MemorySchema>
export type SkillsConfig = z.infer<typeof SkillsSchema>
export type ToolsConfig = z.infer<typeof ToolsSchema>
export type FederationConfig = z.infer<typeof FederationSchema>
export type FederationPeer = z.infer<typeof FederationPeerSchema>
