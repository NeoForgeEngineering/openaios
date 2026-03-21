export interface MemoryEntry {
  key: string
  content: string
  metadata?: Record<string, unknown>
  score?: number
  createdAt: string
  updatedAt: string
}

export interface MemoryAdapter {
  store(
    agentName: string,
    key: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>

  search(
    agentName: string,
    query: string,
    opts?: { topK?: number; minScore?: number },
  ): Promise<MemoryEntry[]>

  get(agentName: string, key: string): Promise<MemoryEntry | undefined>

  delete(agentName: string, key: string): Promise<void>

  buildPromptContext(
    agentName: string,
    query: string,
    maxTokens: number,
  ): Promise<string>

  close(): void
}
