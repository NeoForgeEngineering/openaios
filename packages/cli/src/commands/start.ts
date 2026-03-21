import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { BudgetManager } from '@openaios/budget'
import { TelegramAdapter, WebhookAdapter } from '@openaios/channels'
import type {
  AgentBusRequest,
  AgentBusResponse,
  AgentConfig,
  MemoryAdapter,
} from '@openaios/core'
import { loadConfig, logger } from '@openaios/core'
import { createGovernance } from '@openaios/governance'
import {
  createEmbeddingProvider,
  createMemoryGetTool,
  createMemorySearchTool,
  MemoryStore,
} from '@openaios/memory'
import { Collector } from '@openaios/observability'
import type { AgentRoute } from '@openaios/router'
import {
  AgentBus,
  FederatedAgentBus,
  RouterCore,
  SQLiteSessionStore,
} from '@openaios/router'
import type { ToolGate } from '@openaios/runner'
import {
  CapabilityProvisioner,
  ContainerOrchestrator,
  createRunner,
} from '@openaios/runner'
import {
  createFilesystemEditTool,
  createFilesystemGlobTool,
  createFilesystemGrepTool,
  createFilesystemReadTool,
  createFilesystemWriteTool,
  createImageAnalyzeTool,
  createPdfParseTool,
  createShellExecTool,
  createWebFetchTool,
  createWebSearchTool,
  RoleRegistry,
  ToolExecutor,
  ToolRegistry,
} from '@openaios/tools'
import { SecurityAuditor } from '../audit/auditor.js'
import type { AgentPatch } from '../dashboard/config-writer.js'
import { patchAgentInConfig } from '../dashboard/config-writer.js'
import { DashboardServer } from '../dashboard/server.js'

export async function startCommand(options: {
  config?: string
  dataDir?: string
}): Promise<void> {
  const configPath = resolve(
    options.config ?? process.env.OPENAIOS_CONFIG ?? 'openAIOS.yml',
  )
  const config = loadConfig(configPath)

  const dataDir = resolve(options.dataDir ?? config.data.dir)
  const workspacesDir = join(dataDir, '..', 'workspaces')
  const memoryDir = resolve(config.memory.dir)

  logger.info('[openaios]', `Starting with config: ${configPath}`)
  logger.info('[openaios]', `Data dir: ${dataDir}`)

  // Ensure memory directory exists
  mkdirSync(memoryDir, { recursive: true })
  logger.info('[openaios]', `Shared memory dir: ${memoryDir}`)

  // Session store
  const sessionStore = new SQLiteSessionStore(dataDir)

  // Budget manager
  const budget = new BudgetManager({
    dataDir,
    agentConfigs: config.budget?.agents ?? {},
    ...(config.budget?.period !== undefined && {
      period: config.budget.period,
    }),
  })

  // Governance
  const agentPermissions = Object.fromEntries(
    config.agents.map((a) => [a.name, a.permissions]),
  )
  // Path policy — restrict filesystem tools to workspace by default
  const { PathPolicy } = await import('@openaios/governance')
  let pathPolicy: InstanceType<typeof PathPolicy>
  if (config.governance?.paths) {
    // Transform config paths to PathPolicy format
    const configPaths: Record<string, { allow?: string[]; deny?: string[] }> =
      {}
    for (const [name, p] of Object.entries(config.governance.paths)) {
      configPaths[name] = {
        ...(p.allow !== undefined && { allow: p.allow }),
        ...(p.deny !== undefined && { deny: p.deny }),
      }
    }
    pathPolicy = new PathPolicy(configPaths)
  } else {
    // Default: each agent can only access its own workspace + memory + cwd
    const defaultPaths: Record<string, { allow?: string[]; deny?: string[] }> =
      {}
    for (const agent of config.agents) {
      defaultPaths[agent.name] = {
        allow: [
          join(workspacesDir, '**'),
          join(memoryDir, '**'),
          join(process.cwd(), '**'),
        ],
        deny: ['**/.env', '**/.env.*', '**/node_modules/**'],
      }
    }
    pathPolicy = new PathPolicy(defaultPaths)
    logger.info(
      '[openaios]',
      'Default path policy: agents restricted to workspace + memory + cwd',
    )
  }

  const governance = createGovernance({
    agentPermissions,
    pathPolicy,
    ...(config.governance?.br !== undefined && {
      br: {
        url: config.governance.br.url,
        token: config.governance.br.token,
        failSecure: config.governance.br.fail_secure,
      },
    }),
  })

  // Roles
  const roleRegistry = new RoleRegistry()
  roleRegistry.loadFromDirectory(join(process.cwd(), 'roles'))
  logger.info(
    '[openaios]',
    `Roles: ${roleRegistry.list().length} loaded (${roleRegistry
      .list()
      .map((r) => r.id)
      .join(', ')})`,
  )

  // Tool registry
  const toolRegistry = setupTools(config.tools)
  logger.info(
    '[openaios]',
    `Tool registry: ${toolRegistry.list().length} built-in tools registered`,
  )

  // Semantic memory
  const memoryStore = setupMemory(config.memory, memoryDir)
  if (memoryStore) {
    toolRegistry.add(createMemorySearchTool(memoryStore))
    toolRegistry.add(createMemoryGetTool(memoryStore))
    logger.info(
      '[openaios]',
      'Semantic memory enabled with memory_search + memory_get tools',
    )
  }

  // Governed tool gate — used by SDK runners (external, anthropic-api, openai-api)
  // Every tool call goes through: ToolExecutor → governance.checkPolicy() → tool.execute()
  const toolExecutor = new ToolExecutor(toolRegistry, governance)
  const toolGate: ToolGate = {
    execute: (name, input, ctx) => toolExecutor.execute(name, input, ctx),
    listForAgent: (agentCfg) => {
      const allowed = new Set(agentCfg.allowedTools)
      const denied = new Set(agentCfg.deniedTools)
      const hasWildcard = allowed.has('*')
      return toolRegistry
        .list()
        .filter((t) => {
          if (denied.has(t.name)) return false
          if (hasWildcard) return true
          return allowed.has(t.name)
        })
        .map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }))
    },
  }

  // Detect if any agent needs docker mode
  const hasDockerAgents = config.agents.some((a) => a.runner.env === 'docker')

  // --- Shared HTTP server (dashboard + webhook channels) ---
  const httpServer = createServer()

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(config.network.port, () => {
      logger.info(
        '[openaios]',
        `HTTP server listening on port ${config.network.port}`,
      )
      resolve()
    })
    httpServer.on('error', reject)
  })

  // --- Bus HTTP server ---
  const busToken = randomUUID()
  let busPort = 0
  const localBus = new AgentBus({ governance, sessionStore, budget })
  const bus: AgentBus | FederatedAgentBus = config.federation
    ? new FederatedAgentBus(
        localBus,
        config.federation.node_id,
        config.federation.peers.map((p) => ({
          nodeId: p.node_id,
          busUrl: p.bus_url,
          token: p.token,
          agents: p.agents,
        })),
      )
    : localBus

  const busServer = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/internal/bus/message') {
      res.writeHead(404).end('Not found')
      return
    }

    const auth = req.headers.authorization
    const inboundToken = config.federation?.inbound_token
    const isLocal = auth === `Bearer ${busToken}`
    const isPeer =
      inboundToken !== undefined && auth === `Bearer ${inboundToken}`
    if (!isLocal && !isPeer) {
      res.writeHead(401).end('Unauthorized')
      return
    }

    let body = ''
    req.setEncoding('utf-8')
    req.on('data', (chunk: string) => {
      body += chunk
    })
    req.on('end', () => {
      let parsed: AgentBusRequest
      try {
        parsed = JSON.parse(body) as AgentBusRequest
      } catch {
        res.writeHead(400).end('Invalid JSON')
        return
      }

      const busReq: AgentBusRequest = isPeer
        ? { ...parsed, inboundPeer: config.federation?.node_id ?? 'peer' }
        : parsed

      bus
        .request(busReq)
        .then((result: AgentBusResponse) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: message }))
        })
    })
  })

  const busBindAddr = resolveBindAddress(config.network.bind)
  await new Promise<void>((resolve) => {
    const desiredPort = config.network.bus_port ?? 0
    busServer.listen(desiredPort, busBindAddr, () => {
      const addr = busServer.address()
      busPort =
        typeof addr === 'object' && addr !== null ? addr.port : desiredPort
      resolve()
    })
  })

  const busUrl = `http://${busBindAddr}:${busPort}`
  logger.info('[openaios]', `Agent bus listening on ${busUrl}`)

  // Containers on the Docker bridge can't reach the tailscale IP.
  // host.docker.internal resolves to the Docker host gateway (requires --add-host in orchestrator).
  const containerBusUrl =
    config.network.bind === 'tailscale'
      ? `http://host.docker.internal:${busPort}`
      : busUrl

  if (config.network.tsdproxy) {
    logger.info(
      '[openaios]',
      'tsdproxy enabled — agent containers will be registered on the Tailscale network',
    )
  }

  // --- Container orchestration ---
  let orchestrator: ContainerOrchestrator | undefined
  let provisioner: CapabilityProvisioner | undefined

  if (hasDockerAgents) {
    orchestrator = new ContainerOrchestrator({
      busUrl,
      containerBusUrl,
      busToken,
      ...(config.federation?.node_id !== undefined && {
        nodeId: config.federation.node_id,
      }),
      ...(config.network.tsdproxy && { tsdproxy: true }),
    })
    provisioner = new CapabilityProvisioner(orchestrator)

    // Start containers for all docker-mode agents up front
    for (const agent of config.agents) {
      if (agent.runner.env === 'docker') {
        await orchestrator.ensureRunning(agent.name, agent.runner.docker)
      }
    }
  }

  // Provision capabilities for all agents
  if (provisioner) {
    for (const agent of config.agents) {
      if (agent.runner.env === 'docker') {
        await provisioner.provision(agent.name, agent.capabilities)
      }
    }
  }

  // Memory system prompt suffix
  const memoryPromptSuffix = [
    '',
    `Your shared memory directory is at ${memoryDir} (or /workspace/memory in docker mode).`,
    'Use Read/Write/Grep tools on .md files there to store and recall information across sessions.',
  ].join('\n')

  // Skills dir (resolve ~ to home directory)
  const skillsDir = config.skills.dir.replace(/^~/, homedir())

  // Build routes
  const providers = config.models?.providers ?? {}
  const routes: AgentRoute[] = []
  const agentModels = new Map<string, string>()
  const runnersByAgent = new Map<
    string,
    import('@openaios/core').RunnerAdapter
  >()

  for (const agent of config.agents) {
    const agentConfig = buildAgentConfig({
      agent,
      workspacesDir,
      memoryDir,
      memoryPromptSuffix,
      skillsDir,
    })

    const runner = createRunner(agentConfig, providers, agent.runner, {
      ...(orchestrator !== undefined && { orchestrator }),
      toolGate,
    })

    agentModels.set(agent.name, agent.model.default)
    runnersByAgent.set(agent.name, runner)

    // Register on the bus — runner owns all config internally
    bus.register(agent.name, {
      runner,
      defaultModel: agent.model.default,
      allowedCallees: agent.capabilities['agent-calls'],
    })

    // Wire channels
    if (agent.channels.telegram) {
      const adapter = new TelegramAdapter(agent.channels.telegram.token)
      routes.push({
        agentName: agent.name,
        defaultModel: agent.model.default,
        ...(agent.model.premium !== undefined && {
          premiumModel: agent.model.premium,
        }),
        runner,
        channel: adapter,
      })
      logger.info('[openaios]', `Agent "${agent.name}" → Telegram`)
    }

    if (agent.channels.webhook) {
      const adapter = new WebhookAdapter({
        server: httpServer,
        path: agent.channels.webhook.path,
        ...(agent.channels.webhook.secret !== undefined && {
          secret: agent.channels.webhook.secret,
        }),
      })
      routes.push({
        agentName: agent.name,
        defaultModel: agent.model.default,
        ...(agent.model.premium !== undefined && {
          premiumModel: agent.model.premium,
        }),
        runner,
        channel: adapter,
      })
      logger.info(
        '[openaios]',
        `Agent "${agent.name}" → Webhook (${agent.channels.webhook.path})`,
      )
    }

    if (
      !agent.channels.telegram &&
      !agent.channels.discord &&
      !agent.channels.webhook
    ) {
      logger.warn(
        '[openaios]',
        `Agent "${agent.name}" has no channels configured — skipping`,
      )
    }
  }

  if (routes.length === 0) {
    throw new Error(
      'No agents with configured channels found. Check your openAIOS.yml.',
    )
  }

  const router = new RouterCore({
    routes,
    sessionStore,
    governance,
    budget,
    bus,
  })

  // Observability
  const collector = new Collector({
    dbPath: join(dataDir, 'observability.db'),
    ...(config.governance?.br !== undefined && {
      br: {
        url: config.governance.br.url,
        token: config.governance.br.token,
      },
    }),
  })

  // Record every completed turn
  router.events.on('turn', (evt: Record<string, unknown>) => {
    if (evt.type === 'turn:complete') {
      collector.recordTurn({
        agentName: String(evt.agentName),
        sessionKey: String(evt.userId),
        channel: String(evt.channel),
        model: String(evt.model),
        userMessage: '', // not available in event yet
        agentMessage: String(evt.output ?? '').slice(0, 10000),
        inputTokens: 0,
        outputTokens: 0,
        costUsd: Number(evt.costUsd ?? 0),
        durationMs: Number(evt.durationMs ?? 0),
        timestampMs: Number(evt.timestampMs),
      })
    }
  })

  /**
   * Hot-reload an agent's config when governance or persona changes.
   * Propagates new systemPrompt/allowedTools/deniedTools to the runner
   * without losing session continuity.
   */
  const onAgentUpdate = (agentName: string, patch: AgentPatch): void => {
    patchAgentInConfig(configPath, agentName, patch)

    const freshConfig = loadConfig(configPath)
    const agentCfg = freshConfig.agents.find((a) => a.name === agentName)
    if (!agentCfg) return

    const newAgentConfig = buildAgentConfig({
      agent: agentCfg,
      workspacesDir,
      memoryDir,
      memoryPromptSuffix,
      skillsDir,
    })

    // Propagate governance changes to the runner (BR platform or local)
    const existingRunner = runnersByAgent.get(agentName)
    if (existingRunner) {
      existingRunner.reconfigure(newAgentConfig)

      bus.register(agentName, {
        runner: existingRunner,
        defaultModel: agentCfg.model.default,
        allowedCallees: agentCfg.capabilities['agent-calls'],
      })
    }

    logger.info('[openaios]', `Hot-reloaded agent "${agentName}"`)
  }

  // --- Dashboard ---
  const dashboardServer = new DashboardServer({
    server: httpServer,
    sessionStore,
    budgetManager: budget,
    config,
    agentModels,
    configPath,
    skillsDir,
    onAgentUpdate,
    routerEvents: router.events,
    roleRegistry,
    collector,
    ...(config.network.admin_token !== undefined && {
      adminToken: config.network.admin_token,
    }),
  })
  dashboardServer.register()

  // --- Security auditor ---
  const auditor = new SecurityAuditor({
    config,
    configPath,
    sessionStore,
    budgetManager: budget,
  })
  const runAudit = async () => {
    const result = await auditor.run()
    dashboardServer.setAuditResult(result)
    for (const finding of result.findings) {
      if (finding.severity === 'ERROR') {
        logger.error(
          '[audit]',
          `${finding.agentName} ${finding.code}: ${finding.message}`,
        )
      } else if (finding.severity === 'WARN') {
        logger.warn(
          '[audit]',
          `${finding.agentName} ${finding.code}: ${finding.message}`,
        )
      } else {
        logger.info(
          '[audit]',
          `${finding.agentName} ${finding.code}: ${finding.message}`,
        )
      }
    }
  }
  await runAudit()
  const auditInterval = setInterval(
    () => {
      void runAudit()
    },
    30 * 60 * 1000,
  )

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info('[openaios]', `Received ${signal}, shutting down...`)
    clearInterval(auditInterval)
    await router.stop()
    busServer.close()
    httpServer.close()
    if (provisioner) await provisioner.deprovisionAll()
    if (orchestrator) await orchestrator.stopAll()
    if (memoryStore) memoryStore.close()
    collector.close()
    budget.close()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  await router.start()
  logger.info(
    '[openaios]',
    `Dashboard available at http://localhost:${config.network.port}`,
  )
  logger.info('[openaios]', 'Running. Press Ctrl+C to stop.')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAgentConfig(opts: {
  agent: ReturnType<typeof loadConfig>['agents'][number]
  workspacesDir: string
  memoryDir: string
  memoryPromptSuffix: string
  skillsDir: string
}): AgentConfig {
  const { agent, workspacesDir, memoryDir, memoryPromptSuffix, skillsDir } =
    opts

  const basePersona = resolvePersona(agent.persona)

  const skillsSuffix = agent.skills
    .map((skillName) => {
      const skillPath = join(skillsDir, skillName, 'SKILL.md')
      try {
        return `\n\n${readFileSync(skillPath, 'utf-8')}`
      } catch {
        logger.warn(
          '[openaios]',
          `Skill "${skillName}" not found at ${skillPath}`,
        )
        return ''
      }
    })
    .join('')

  const systemPrompt = basePersona + memoryPromptSuffix + skillsSuffix

  // Auto-add call_agent to allowedTools when agent-calls is configured
  const agentCallsTools =
    agent.capabilities['agent-calls'].length > 0 ? ['call_agent'] : []

  // Auto-add Bash(agent-browser:*) for native agents with browser capability
  const browserTools =
    agent.capabilities.browser && agent.runner.env === 'native'
      ? ['Bash(agent-browser:*)']
      : []

  const allowedTools = [
    ...agent.permissions.allow,
    ...agentCallsTools,
    ...browserTools,
  ]

  return {
    agentName: agent.name,
    systemPrompt,
    defaultModel: agent.model.default,
    ...(agent.model.premium !== undefined && {
      premiumModel: agent.model.premium,
    }),
    allowedTools,
    deniedTools: agent.permissions.deny,
    workspacesDir,
    memoryDir,
  }
}

function resolveBindAddress(bind: string): string {
  if (bind === 'localhost') return '127.0.0.1'
  if (bind === 'tailscale') {
    const result = spawnSync('tailscale', ['ip', '-4'], {
      encoding: 'utf-8',
      timeout: 3000,
    })
    const ip = result.stdout?.trim()
    if (ip) return ip
    logger.warn(
      '[openaios]',
      'Tailscale IP not found, falling back to 127.0.0.1',
    )
    return '127.0.0.1'
  }
  return bind
}

function setupTools(
  toolsConfig?: ReturnType<typeof loadConfig>['tools'],
): ToolRegistry {
  const registry = new ToolRegistry()

  // Register built-in tools
  registry.add(
    createWebFetchTool({
      ...(toolsConfig?.url_allowlist !== undefined && {
        urlAllowlist: toolsConfig.url_allowlist,
      }),
      ...(toolsConfig?.url_denylist !== undefined && {
        urlDenylist: toolsConfig.url_denylist,
      }),
    }),
  )

  if (toolsConfig?.search_provider !== undefined) {
    registry.add(
      createWebSearchTool({
        provider: toolsConfig.search_provider,
        ...(toolsConfig.search_api_key !== undefined && {
          apiKey: toolsConfig.search_api_key,
        }),
      }),
    )
  }

  registry.add(createPdfParseTool())
  registry.add(createImageAnalyzeTool())

  // Core coding tools — governed filesystem + shell access
  registry.add(createFilesystemReadTool())
  registry.add(createFilesystemWriteTool())
  registry.add(createFilesystemEditTool())
  registry.add(createFilesystemGlobTool())
  registry.add(createFilesystemGrepTool())
  registry.add(createShellExecTool())

  return registry
}

function setupMemory(
  memoryConfig: ReturnType<typeof loadConfig>['memory'],
  memoryDir: string,
): MemoryAdapter | undefined {
  // Only enable semantic memory if an embedding provider is configured
  if (memoryConfig.provider === undefined) {
    return undefined
  }

  const provider = createEmbeddingProvider(
    memoryConfig.provider,
    memoryConfig.model ?? getDefaultModel(memoryConfig.provider),
    {
      ...(memoryConfig.api_key !== undefined && {
        apiKey: memoryConfig.api_key,
      }),
      ...(memoryConfig.base_url !== undefined && {
        baseUrl: memoryConfig.base_url,
      }),
      ...(memoryConfig.dimensions !== undefined && {
        dimensions: memoryConfig.dimensions,
      }),
    },
  )

  return new MemoryStore({
    dir: memoryDir,
    embeddingProvider: provider,
    topK: memoryConfig.top_k,
    decayHalfLifeDays: memoryConfig.decay_half_life_days,
  })
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'text-embedding-3-small'
    case 'ollama':
      return 'nomic-embed-text'
    case 'voyage':
      return 'voyage-3'
    case 'mistral':
      return 'mistral-embed'
    case 'gemini':
      return 'text-embedding-004'
    default:
      return 'default'
  }
}

function resolvePersona(persona: string): string {
  // If it looks like a file path, try to read it
  if (persona.endsWith('.md') || persona.endsWith('.txt')) {
    const path = resolve(persona)
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8')
    }
    logger.warn(
      '[openaios]',
      `Persona file not found: ${path} — using as inline string`,
    )
  }
  return persona
}
