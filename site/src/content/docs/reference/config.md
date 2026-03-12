---
title: Config Schema
description: Technical reference for the openAIOS.yml Zod schema.
sidebar:
  order: 2
---

The config schema is defined in `packages/core/src/schema/config.ts` using Zod. This page documents the complete schema with types and defaults.

## Root schema

```typescript
const ConfigSchema = z.object({
  agents: z.array(AgentSchema).min(1),
  models: z.object({ providers: ModelProvidersSchema }).optional(),
  budget: BudgetSchema.optional(),
  governance: GovernanceSchema.optional(),
  network: NetworkSchema.default({}),
  data: DataSchema.default({}),
  memory: MemorySchema.default({}),
  skills: SkillsSchema.default({}),
  federation: FederationSchema.optional(),
});
```

## AgentSchema

```typescript
const AgentSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  persona: z.string().default('You are a helpful assistant.'),
  model: AgentModelSchema,
  channels: AgentChannelsSchema,
  permissions: AgentPermissionsSchema.default({}),
  runner: RunnerConfigSchema.default({}),
  capabilities: CapabilitiesSchema.default({}),
  skills: z.array(z.string()).default([]),
});
```

## AgentChannelsSchema

```typescript
const AgentChannelsSchema = z.object({
  telegram: z.object({
    token: envString(),
  }).optional(),
  discord: z.object({
    token: envString(),
    guildId: z.string().optional(),
  }).optional(),
  webhook: z.object({
    path: z.string().default('/webhook'),
    secret: envString().optional(),
  }).optional(),
});
```

## AgentPermissionsSchema

```typescript
const AgentPermissionsSchema = z.object({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
});
```

## RunnerConfigSchema

```typescript
const RunnerConfigSchema = z.object({
  /** WHERE the agent runs */
  env: z.enum(['docker', 'native', 'external']).default('docker'),
  /** WHICH LLM drives the agentic loop */
  llm: z.enum(['claude-code', 'openai-compat', 'gemini', 'ollama']).default('claude-code'),
  /** Gateway config — required when llm !== 'claude-code' */
  llm_config: z.object({
    base_url: z.string(),       // ANTHROPIC_BASE_URL
    api_key: z.string().optional(),  // ANTHROPIC_AUTH_TOKEN
  }).optional(),
  /** Must be set to explicitly allow native agents */
  native: z.object({
    allow_host_access: z.literal(true),
  }).optional(),
  /** Docker container config */
  docker: z.object({
    image: z.string().default('node:22-slim'),
    memory: z.string().optional(),     // e.g. "1g"
    cpus: z.number().optional(),
  }).optional(),
  /** External agent config — required when env === 'external' */
  external: z.object({
    base_url: z.string(),            // OpenAI-compat endpoint, e.g. http://localhost:18789/v1
    api_key: z.string().optional(),  // Bearer token (optional)
  }).optional(),
});
```

### `env: 'external'` — governance layer mode

When `env` is `external`, openAIOS acts as a **governance and channel layer** only. The agentic loop
(tool calling, context management, LLM interaction) runs in an external agent system — openclaw,
LiteLLM, vLLM, or any OpenAI-compatible endpoint.

Budget enforcement, BR governance, session tracking, and channel routing all continue to operate
unchanged in openAIOS. Session continuity is maintained in-process via an in-memory message history.

Tool restrictions (`permissions.allow` / `permissions.deny`) are expressed as advisory instructions
in the system prompt rather than hard CLI flags — the external agent is responsible for honouring them.

```yaml
agents:
  - name: assistant
    persona: "You are a helpful assistant."
    model:
      default: claude-sonnet-4-6
    runner:
      env: external
      external:
        base_url: http://localhost:18789/v1   # openclaw WebSocket gateway
        api_key: ${OPENCLAW_KEY}              # optional
    permissions:
      allow: [Read, Grep]   # injected as system prompt advisory
```

## CapabilitiesSchema

```typescript
const CapabilitiesSchema = z.object({
  browser: z.boolean().default(false),
  'agent-calls': z.array(z.string()).default([]),
});
```

## ModelProvidersSchema

```typescript
const ModelProvidersSchema = z.object({
  ollama: z.object({
    base_url: z.string().default('http://localhost:11434'),
  }).optional(),
  anthropic: ApiKeyProviderSchema.optional(),
  groq: ApiKeyProviderSchema.optional(),
  openrouter: ApiKeyProviderSchema.optional(),
  openai: ApiKeyProviderSchema.optional(),
  'claude-code': z.object({
    bin: z.string().default('claude'),
  }).optional(),
});

const ApiKeyProviderSchema = z.object({
  api_key: envString(),
  base_url: z.string().optional(),
});
```

## BudgetSchema

```typescript
const BudgetSchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly']).default('monthly'),
  agents: z.record(z.string(), z.object({
    limit: z.number(),
    warning_at: z.number().min(0).max(1).default(0.8),
    on_exceeded: z.enum(['block', 'downgrade', 'warn']),
    downgrade_to: z.string().optional(),
  })),
});
```

## NetworkSchema

```typescript
const NetworkSchema = z.object({
  bind: z.string().default('tailscale'),
  port: z.number().default(3000),
  bus_port: z.number().default(0),
  tsdproxy: z.boolean().default(false),
});
```

## DataSchema / MemorySchema

```typescript
const DataSchema = z.object({
  dir: z.string().default('./data'),
});

const MemorySchema = z.object({
  dir: z.string().default('./data/memory'),
});
```

## SkillsSchema

```typescript
const SkillsSchema = z.object({
  dir: z.string().default('~/.openclaw/skills'),
});
```

## FederationSchema (BR Platform)

Requires `governance.br` to be configured. Used for multi-node agent routing under Bot Resources.

```typescript
const FederationPeerSchema = z.object({
  node_id: z.string(),
  bus_url: envString(),        // supports ${ENV_VAR}
  token: envString(),          // supports ${ENV_VAR}
  agents: z.array(z.string()),
});

const FederationSchema = z.object({
  node_id: z.string(),
  inbound_token: envString(),  // supports ${ENV_VAR}
  peers: z.array(FederationPeerSchema),
});
```

## Environment variable resolution

Before Zod validation, all `${VAR_NAME}` patterns in string values are resolved from `process.env`. Unresolved variables cause a startup error with a clear message indicating which variable is missing.
