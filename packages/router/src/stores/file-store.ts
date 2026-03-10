import { existsSync, mkdirSync } from 'node:fs'
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Session, SessionKey, SessionStore } from '@openaios/core'

/**
 * FileSessionStore — stores each session as a JSON file.
 * Simple, zero-dependency. Suitable for single-node deployments.
 */
export class FileSessionStore implements SessionStore {
  private readonly dir: string

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'sessions')
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true })
    }
  }

  async get(key: SessionKey): Promise<Session | undefined> {
    const path = this.filePath(key)
    try {
      const raw = await readFile(path, 'utf-8')
      return JSON.parse(raw) as Session
    } catch {
      return undefined
    }
  }

  async set(session: Session): Promise<void> {
    const path = this.filePath({
      agentName: session.agentName,
      userId: session.userId,
    })
    await writeFile(path, JSON.stringify(session, null, 2), 'utf-8')
  }

  async delete(key: SessionKey): Promise<void> {
    const path = this.filePath(key)
    try {
      await unlink(path)
    } catch {
      // Already gone — fine
    }
  }

  async listByAgent(agentName: string): Promise<Session[]> {
    const prefix = `${agentName}__`
    try {
      const files = await readdir(this.dir)
      const sessions = await Promise.all(
        files
          .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
          .map(async (f) => {
            try {
              const raw = await readFile(join(this.dir, f), 'utf-8')
              return JSON.parse(raw) as Session
            } catch {
              return null
            }
          }),
      )
      return sessions.filter((s): s is Session => s !== null)
    } catch {
      return []
    }
  }

  async listAll(): Promise<Session[]> {
    try {
      const files = await readdir(this.dir)
      const sessions = await Promise.all(
        files
          .filter((f) => f.endsWith('.json'))
          .map(async (f) => {
            try {
              const raw = await readFile(join(this.dir, f), 'utf-8')
              return JSON.parse(raw) as Session
            } catch {
              return null
            }
          }),
      )
      return sessions.filter((s): s is Session => s !== null)
    } catch {
      return []
    }
  }

  private filePath(key: SessionKey): string {
    // Sanitise to prevent path traversal
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')
    return join(this.dir, `${safe(key.agentName)}__${safe(key.userId)}.json`)
  }
}
