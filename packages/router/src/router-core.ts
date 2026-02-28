import { join } from 'node:path'
import type {
  ChannelAdapter,
  GovernanceAdapter,
  InboundMessage,
  RunnerAdapter,
  Session,
  SessionStore,
} from '@openaios/core'
import type { BudgetManager } from '@openaios/budget'

export interface AgentRoute {
  agentName: string
  systemPrompt: string
  defaultModel: string
  premiumModel?: string
  allowedTools: string[]
  deniedTools: string[]
  runner: RunnerAdapter
  channel: ChannelAdapter
}

export interface RouterCoreOptions {
  routes: AgentRoute[]
  sessionStore: SessionStore
  governance: GovernanceAdapter
  budget: BudgetManager
  /** Base directory for agent workspaces */
  workspacesDir: string
}

const MAX_MESSAGE_BYTES = 16 * 1024 // 16KB
const SESSION_ID_REGEX = /^[a-zA-Z0-9:_-]+$/
const AGENT_NAME_REGEX = /^[a-z0-9-]+$/

export class RouterCore {
  private readonly opts: RouterCoreOptions
  private readonly routesByChannel = new Map<ChannelAdapter, AgentRoute>()

  constructor(opts: RouterCoreOptions) {
    this.opts = opts

    for (const route of opts.routes) {
      if (!AGENT_NAME_REGEX.test(route.agentName)) {
        throw new Error(`Invalid agent name: "${route.agentName}"`)
      }
      this.routesByChannel.set(route.channel, route)
      route.channel.onMessage((msg) => this.handleMessage(route, msg))
    }
  }

  async start(): Promise<void> {
    await Promise.all(this.opts.routes.map((r) => r.channel.start()))
    console.log(`[router] Started ${this.opts.routes.length} agent(s)`)
  }

  async stop(): Promise<void> {
    await Promise.all(this.opts.routes.map((r) => r.channel.stop()))
    console.log('[router] Stopped')
  }

  private async handleMessage(route: AgentRoute, msg: InboundMessage): Promise<void> {
    // Input validation
    if (Buffer.byteLength(msg.text, 'utf-8') > MAX_MESSAGE_BYTES) {
      await route.channel.send(
        msg.source,
        { text: 'Message too long (max 16KB).', replyToMessageId: msg.messageId }
      )
      return
    }

    const userId = `${route.channel.channelType}:${msg.userId}`
    if (!SESSION_ID_REGEX.test(userId)) {
      console.warn(`[router] Invalid userId format: ${userId}`)
      return
    }

    const sessionKey = { agentName: route.agentName, userId }

    // Load or create session
    let session = await this.opts.sessionStore.get(sessionKey)

    // Budget check — may downgrade model
    const budgetCheck = this.opts.budget.check(route.agentName, route.defaultModel)
    if (!budgetCheck.allowed) {
      await route.channel.send(msg.source, {
        text: `Sorry, the budget for this agent has been exceeded. ${budgetCheck.reason ?? ''}`.trim(),
        replyToMessageId: msg.messageId,
      })
      return
    }

    const effectiveModel = budgetCheck.effectiveModel ?? route.defaultModel
    const isDowngraded = effectiveModel !== route.defaultModel

    if (isDowngraded) {
      console.log(
        `[router] ${route.agentName}: budget downgrade → ${effectiveModel}`
      )
    }

    try {
      const result = await route.runner.run({
        agentName: route.agentName,
        sessionKey: userId,
        claudeSessionId: session?.claudeSessionId,
        message: msg.text,
        systemPrompt: route.systemPrompt,
        workspaceDir: join(this.opts.workspacesDir, route.agentName),
        allowedTools: route.allowedTools,
        deniedTools: route.deniedTools,
        model: effectiveModel,
      })

      // Update session
      const now = Date.now()
      const updatedSession: Session = {
        agentName: route.agentName,
        userId,
        claudeSessionId: result.claudeSessionId,
        currentModel: effectiveModel,
        totalCostUsd: (session?.totalCostUsd ?? 0) + (result.costUsd ?? 0),
        createdAt: session?.createdAt ?? now,
        updatedAt: now,
      }
      await this.opts.sessionStore.set(updatedSession)

      // Record budget usage
      if (result.costUsd) {
        this.opts.budget.record(
          route.agentName,
          result.costUsd,
          result.inputTokens,
          result.outputTokens
        )
      }

      // Report to governance (fire-and-forget)
      if (result.costUsd) {
        this.opts.governance.reportTurnCost({
          agentName: route.agentName,
          sessionKey: userId,
          costUsd: result.costUsd,
          inputTokens: result.inputTokens ?? 0,
          outputTokens: result.outputTokens ?? 0,
          model: effectiveModel,
          timestampMs: Date.now(),
        })
      }

      await route.channel.send(msg.source, {
        text: result.output,
        parseMode: 'markdown',
        replyToMessageId: msg.messageId,
      })
    } catch (err) {
      console.error(`[router] ${route.agentName} error:`, err)
      await route.channel.send(msg.source, {
        text: 'Sorry, something went wrong. Please try again.',
        replyToMessageId: msg.messageId,
      })
    }
  }
}
