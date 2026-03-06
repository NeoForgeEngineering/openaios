/**
 * Singleton structured logger for openAIOS.
 *
 * TTY:     pretty  — `[ts] LEVEL [tag] msg`
 * Non-TTY: JSON    — `{"ts":"...","level":"info","tag":"...","msg":"...",...}`
 *
 * In-memory ring buffer of last 500 entries for dashboard live log stream.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  ts: string
  level: LogLevel
  tag: string
  msg: string
  meta?: unknown
}

type Subscriber = (entry: LogEntry) => void

const RING_SIZE = 500

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',   // gray
  info:  '\x1b[37m',   // white
  warn:  '\x1b[33m',   // yellow
  error: '\x1b[31m',   // red
}

const RESET = '\x1b[0m'

class Logger {
  private readonly ring: LogEntry[] = []
  private readonly subscribers = new Set<Subscriber>()
  private minLevel: LogLevel = 'debug'

  debug(tag: string, msg: string, meta?: unknown): void {
    this.emit('debug', tag, msg, meta)
  }

  info(tag: string, msg: string, meta?: unknown): void {
    this.emit('info', tag, msg, meta)
  }

  warn(tag: string, msg: string, meta?: unknown): void {
    this.emit('warn', tag, msg, meta)
  }

  error(tag: string, msg: string, meta?: unknown): void {
    this.emit('error', tag, msg, meta)
  }

  /** Return a copy of the ring buffer (most recent last). */
  getRecent(): LogEntry[] {
    return this.ring.slice()
  }

  /**
   * Subscribe to new log entries in real time.
   * Returns an unsubscribe function.
   */
  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn)
    return () => { this.subscribers.delete(fn) }
  }

  private emit(level: LogLevel, tag: string, msg: string, meta?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      tag,
      msg,
      ...(meta !== undefined && { meta }),
    }

    // Append to ring buffer
    if (this.ring.length >= RING_SIZE) {
      this.ring.shift()
    }
    this.ring.push(entry)

    // Write to stdout
    if (process.stdout.isTTY) {
      const color = LEVEL_COLORS[level]
      const ts = entry.ts.replace('T', ' ').replace('Z', '').slice(0, 19)
      const levelStr = level.toUpperCase().padEnd(5)
      const metaStr = meta !== undefined ? ' ' + JSON.stringify(meta) : ''
      process.stdout.write(`${color}${ts} ${levelStr} ${tag} ${msg}${metaStr}${RESET}\n`)
    } else {
      process.stdout.write(JSON.stringify(entry) + '\n')
    }

    // Notify subscribers
    for (const fn of this.subscribers) {
      try { fn(entry) } catch { /* ignore subscriber errors */ }
    }
  }
}

export const logger = new Logger()
