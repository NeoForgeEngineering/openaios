import { logger } from '@openaios/core'

export interface CronJob {
  name: string
  agent: string
  schedule: string
  message: string
}

export interface DispatchRequest {
  agentName: string
  sessionKey: string
  message: string
}

export type DispatchFn = (req: DispatchRequest) => Promise<void>

/**
 * Cron scheduler using standard cron expressions.
 * Checks every 60 seconds if any job should fire.
 */
export class CronScheduler {
  private jobs: CronJob[]
  private dispatch: DispatchFn
  private interval: ReturnType<typeof setInterval> | undefined = undefined
  private lastFired = new Map<string, number>()

  constructor(jobs: CronJob[], dispatch: DispatchFn) {
    this.jobs = jobs
    this.dispatch = dispatch
  }

  start(): void {
    if (this.interval) return

    // Check every 60 seconds
    this.interval = setInterval(() => {
      void this.tick()
    }, 60_000)

    // Also tick immediately on start
    void this.tick()

    logger.info(
      '[automation]',
      `Cron scheduler started with ${this.jobs.length} job(s)`,
    )
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = undefined
    }
    logger.info('[automation]', 'Cron scheduler stopped')
  }

  /** Exposed for testing — check all jobs and fire if due. */
  async tick(now?: Date): Promise<string[]> {
    const current = now ?? new Date()
    const fired: string[] = []

    for (const job of this.jobs) {
      if (this.shouldFire(job, current)) {
        fired.push(job.name)
        this.lastFired.set(job.name, current.getTime())

        try {
          await this.dispatch({
            agentName: job.agent,
            sessionKey: `cron:${job.name}`,
            message: job.message,
          })
          logger.info(
            '[automation]',
            `Cron job "${job.name}" dispatched to ${job.agent}`,
          )
        } catch (err) {
          logger.error(
            '[automation]',
            `Cron job "${job.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
    }

    return fired
  }

  private shouldFire(job: CronJob, now: Date): boolean {
    // Prevent firing same job within the same minute
    const last = this.lastFired.get(job.name)
    const minuteMs = 60_000
    if (last !== undefined && now.getTime() - last < minuteMs) {
      return false
    }

    return matchCron(job.schedule, now)
  }
}

/**
 * Match a standard 5-field cron expression against a date.
 * Format: minute hour day-of-month month day-of-week
 * Supports: *, ranges (1-5), lists (1,3,5), steps (star/5), names (MON-FRI)
 */
export function matchCron(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const minute = date.getMinutes()
  const hour = date.getHours()
  const dayOfMonth = date.getDate()
  const month = date.getMonth() + 1
  const dayOfWeek = date.getDay() // 0=Sun

  return (
    matchField(parts[0]!, minute, 0, 59) &&
    matchField(parts[1]!, hour, 0, 23) &&
    matchField(parts[2]!, dayOfMonth, 1, 31) &&
    matchField(parts[3]!, month, 1, 12) &&
    matchDowField(parts[4]!, dayOfWeek)
  )
}

const DAY_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
}

function matchDowField(field: string, value: number): boolean {
  // Replace day names with numbers
  const resolved = field.replace(/SUN|MON|TUE|WED|THU|FRI|SAT/gi, (m) =>
    String(DAY_NAMES[m.toUpperCase()] ?? m),
  )
  return matchField(resolved, value, 0, 7)
}

function matchField(
  field: string,
  value: number,
  min: number,
  _max: number,
): boolean {
  if (field === '*') return true

  for (const part of field.split(',')) {
    const stepParts = part.split('/')
    const step =
      stepParts[1] !== undefined ? Number.parseInt(stepParts[1], 10) : 1
    const rangePart = stepParts[0]!

    if (rangePart === '*') {
      // */step
      if ((value - min) % step === 0) return true
      continue
    }

    const rangeBounds = rangePart.split('-')
    if (rangeBounds.length === 2) {
      const start = Number.parseInt(rangeBounds[0]!, 10)
      const end = Number.parseInt(rangeBounds[1]!, 10)
      if (step === 1) {
        if (value >= start && value <= end) return true
      } else {
        for (let i = start; i <= end; i += step) {
          if (i === value) return true
        }
      }
    } else {
      if (Number.parseInt(rangePart, 10) === value) return true
    }
  }

  return false
}
