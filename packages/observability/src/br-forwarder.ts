import { logger } from '@openaios/core'
import type { BRForwardConfig, TurnRecord } from './types.js'

/**
 * Forwards observability data to BR platform for enterprise fleet management.
 * Batches events and flushes periodically or when batch size is reached.
 */
export class BRForwarder {
  private config: BRForwardConfig
  private batch: TurnRecord[] = []
  private flushTimer: ReturnType<typeof setInterval> | undefined = undefined
  private batchSize: number
  private flushIntervalMs: number

  constructor(config: BRForwardConfig) {
    this.config = config
    this.batchSize = config.batchSize ?? 10
    this.flushIntervalMs = config.flushIntervalMs ?? 30_000

    this.flushTimer = setInterval(() => {
      void this.flush()
    }, this.flushIntervalMs)
  }

  /** Add a turn record to the batch. Auto-flushes when batch size is reached. */
  enqueue(turn: TurnRecord): void {
    this.batch.push(turn)
    if (this.batch.length >= this.batchSize) {
      void this.flush()
    }
  }

  /** Flush the current batch to BR. */
  async flush(): Promise<void> {
    if (this.batch.length === 0) return

    const toSend = this.batch.splice(0)

    try {
      const res = await fetch(`${this.config.url}/v1/observability/turns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({ turns: toSend }),
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) {
        logger.warn(
          '[br-obs]',
          `Failed to forward ${toSend.length} turns to BR: ${res.status}`,
        )
        // Put back in batch for retry
        this.batch.unshift(...toSend)
      } else {
        logger.debug('[br-obs]', `Forwarded ${toSend.length} turns to BR`)
      }
    } catch (err) {
      logger.warn(
        '[br-obs]',
        `BR forward failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      // Put back for retry (cap at 100 to prevent OOM)
      if (this.batch.length < 100) {
        this.batch.unshift(...toSend)
      }
    }
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = undefined
    }
    // Final flush
    void this.flush()
  }
}
