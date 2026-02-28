export interface SessionKey {
  /** Agent name */
  agentName: string
  /** Channel-scoped user identifier (e.g. "telegram:12345678") */
  userId: string
}

export interface Session {
  agentName: string
  userId: string
  /** The Claude Code session ID used with --resume */
  claudeSessionId: string
  createdAt: number
  updatedAt: number
  /** Current model in use (may be downgraded from config default) */
  currentModel: string
  /** Total cost accumulated in this session */
  totalCostUsd: number
}

export interface SessionStore {
  get(key: SessionKey): Promise<Session | undefined>
  set(session: Session): Promise<void>
  delete(key: SessionKey): Promise<void>
  /** List all sessions for an agent (for status/admin) */
  listByAgent(agentName: string): Promise<Session[]>
}
