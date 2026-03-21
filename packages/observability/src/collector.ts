import { logger } from '@openaios/core'
import { BRForwarder } from './br-forwarder.js'
import { ObservabilityStore } from './store.js'
import type {
  BRForwardConfig,
  ChatMessage,
  MetricsSummary,
  TurnRecord,
} from './types.js'

export interface CollectorOptions {
  dbPath: string
  /** Auto-prune entries older than this many days (0 = no prune) */
  pruneAfterDays?: number
  /** BR forwarding config — when set, events are forwarded to BR */
  br?: BRForwardConfig
}

/**
 * Collector — single entry point for all observability.
 *
 * Wire into RouterCore events:
 *   router.events.on('turn', (evt) => collector.onTurn(evt))
 *
 * Query via:
 *   collector.getMetrics('assistant')
 *   collector.getChatHistory('assistant', 'telegram:12345')
 *   collector.getRecentTurns()
 */
export class Collector {
  private store: ObservabilityStore
  private forwarder: BRForwarder | undefined
  private pruneAfterDays: number

  constructor(opts: CollectorOptions) {
    this.store = new ObservabilityStore(opts.dbPath)
    this.pruneAfterDays = opts.pruneAfterDays ?? 90

    if (opts.br) {
      this.forwarder = new BRForwarder(opts.br)
      logger.info('[observability]', 'BR forwarding enabled')
    }

    // Auto-prune on startup
    if (this.pruneAfterDays > 0) {
      const pruned = this.store.prune(this.pruneAfterDays)
      if (pruned.turns > 0 || pruned.messages > 0) {
        logger.info(
          '[observability]',
          `Pruned ${pruned.turns} turns + ${pruned.messages} messages older than ${this.pruneAfterDays} days`,
        )
      }
    }

    logger.info('[observability]', 'Collector initialized')
  }

  // ── Recording ───────────────────────────────────────────────

  /** Record a completed turn (call from RouterCore turn:complete event). */
  recordTurn(turn: TurnRecord): void {
    this.store.recordTurn(turn)

    // Record as chat messages too
    this.store.recordMessage({
      agentName: turn.agentName,
      sessionKey: turn.sessionKey,
      role: 'user',
      content: turn.userMessage,
      timestampMs: turn.timestampMs - turn.durationMs,
    })
    this.store.recordMessage({
      agentName: turn.agentName,
      sessionKey: turn.sessionKey,
      role: 'assistant',
      content: turn.agentMessage,
      model: turn.model,
      tokens: turn.inputTokens + turn.outputTokens,
      costUsd: turn.costUsd,
      timestampMs: turn.timestampMs,
    })

    // Forward to BR
    this.forwarder?.enqueue(turn)
  }

  // ── Querying ────────────────────────────────────────────────

  /** Get metrics for a specific agent. */
  getMetrics(
    agentName: string,
    opts?: { fromMs?: number; toMs?: number },
  ): MetricsSummary {
    return this.store.getAgentMetrics(agentName, opts)
  }

  /** Get metrics for all agents. */
  getAllMetrics(opts?: { fromMs?: number; toMs?: number }): MetricsSummary[] {
    return this.store.getAllMetrics(opts)
  }

  /** Get chat history for an agent session. */
  getChatHistory(
    agentName: string,
    sessionKey: string,
    opts?: { limit?: number; before?: number },
  ): ChatMessage[] {
    return this.store.getChatHistory(agentName, sessionKey, opts)
  }

  /** Get recent turns across all agents. */
  getRecentTurns(opts?: { agentName?: string; limit?: number }): TurnRecord[] {
    return this.store.getRecentTurns(opts)
  }

  // ── Lifecycle ───────────────────────────────────────────────

  close(): void {
    this.forwarder?.stop()
    this.store.close()
  }
}
