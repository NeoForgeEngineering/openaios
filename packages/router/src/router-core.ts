import { EventEmitter } from 'node:events'
import type { BudgetManager } from '@openaios/budget'
import type {
  AgentBus as AgentBusInterface,
  ChannelAdapter,
  GovernanceAdapter,
  InboundMessage,
  RunnerAdapter,
  Session,
  SessionStore,
} from '@openaios/core'
import { logger } from '@openaios/core'

export type RouterEvent =
  | {
      type: 'turn:start'
      agentName: string
      userId: string
      channel: string
      timestampMs: number
    }
  | {
      type: 'turn:complete'
      agentName: string
      userId: string
      channel: string
      output: string
      costUsd?: number
      model: string
      durationMs: number
      timestampMs: number
    }
  | {
      type: 'turn:error'
      agentName: string
      userId: string
      channel: string
      error: string
      timestampMs: number
    }
  | {
      type: 'budget:check'
      agentName: string
      allowed: boolean
      effectiveModel?: string
      timestampMs: number
    }

export interface AgentRoute {
  agentName: string
  defaultModel: string
  premiumModel?: string
  runner: RunnerAdapter
  channel: ChannelAdapter
}

export interface RouterCoreOptions {
  routes: AgentRoute[]
  sessionStore: SessionStore
  governance: GovernanceAdapter
  budget: BudgetManager
  /** Optional agent bus for cross-agent calls */
  bus?: AgentBusInterface
}

const MAX_MESSAGE_BYTES = 16 * 1024 // 16KB
const SESSION_ID_REGEX = /^[a-zA-Z0-9:_-]+$/
const AGENT_NAME_REGEX = /^[a-z0-9-]+$/

export class RouterCore {
  private readonly opts: RouterCoreOptions
  private readonly routesByChannel = new Map<ChannelAdapter, AgentRoute>()
  readonly events = new EventEmitter()

  getBus(): AgentBusInterface | undefined {
    return this.opts.bus
  }

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
    logger.info('[router]', `Started ${this.opts.routes.length} agent(s)`)
  }

  async stop(): Promise<void> {
    await Promise.all(this.opts.routes.map((r) => r.channel.stop()))
    logger.info('[router]', 'Stopped')
  }

  private async handleMessage(
    route: AgentRoute,
    msg: InboundMessage,
  ): Promise<void> {
    // Input validation
    if (Buffer.byteLength(msg.text, 'utf-8') > MAX_MESSAGE_BYTES) {
      await route.channel.send(msg.source, {
        text: 'Message too long (max 16KB).',
        replyToMessageId: msg.messageId,
      })
      return
    }

    const userId = `${route.channel.channelType}:${msg.userId}`
    if (!SESSION_ID_REGEX.test(userId)) {
      logger.warn('[router]', `Invalid userId format: ${userId}`)
      return
    }

    const sessionKey = { agentName: route.agentName, userId }

    // Load session for cost tracking
    const session = await this.opts.sessionStore.get(sessionKey)

    // Budget check — may downgrade model
    const budgetCheck = this.opts.budget.check(
      route.agentName,
      route.defaultModel,
    )
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
      logger.info(
        '[router]',
        `${route.agentName}: budget downgrade → ${effectiveModel}`,
      )
    }

    const channelType = route.channel.channelType

    this.events.emit('turn', {
      type: 'budget:check',
      agentName: route.agentName,
      allowed: true,
      ...(isDowngraded && { effectiveModel }),
      timestampMs: Date.now(),
    } satisfies RouterEvent)

    logger.info('[router]', `${route.agentName} ← ${channelType}:${userId}`)

    const turnStartMs = Date.now()
    this.events.emit('turn', {
      type: 'turn:start',
      agentName: route.agentName,
      userId,
      channel: channelType,
      timestampMs: turnStartMs,
    } satisfies RouterEvent)

    try {
      const result = await route.runner.run({
        sessionKey: userId,
        message: msg.text,
        ...(isDowngraded && { modelOverride: effectiveModel }),
      })

      // Update session (cost tracking only — runner owns session continuity)
      const now = Date.now()
      const updatedSession: Session = {
        agentName: route.agentName,
        userId,
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
          result.outputTokens,
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
          model: result.model,
          timestampMs: Date.now(),
        })
      }

      logger.info(
        '[router]',
        `${route.agentName} → ${userId} (${result.costUsd !== undefined ? `$${result.costUsd.toFixed(4)}` : 'no cost'})`,
      )

      this.events.emit('turn', {
        type: 'turn:complete',
        agentName: route.agentName,
        userId,
        channel: channelType,
        output: result.output,
        ...(result.costUsd !== undefined && { costUsd: result.costUsd }),
        model: result.model,
        durationMs: Date.now() - turnStartMs,
        timestampMs: Date.now(),
      } satisfies RouterEvent)

      await route.channel.send(msg.source, {
        text: result.output,
        parseMode: 'markdown',
        replyToMessageId: msg.messageId,
      })
    } catch (err) {
      this.events.emit('turn', {
        type: 'turn:error',
        agentName: route.agentName,
        userId,
        channel: channelType,
        error: err instanceof Error ? err.message : String(err),
        timestampMs: Date.now(),
      } satisfies RouterEvent)

      logger.error('[router]', `${route.agentName} error`, err)
      await route.channel.send(msg.source, {
        text: 'Sorry, something went wrong. Please try again.',
        replyToMessageId: msg.messageId,
      })
    }
  }
}
