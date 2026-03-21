import { logger } from '@openaios/core'

export interface ModelInfo {
  id: string
  provider: string
  name: string
  contextWindow?: number
}

export type ProviderName =
  | 'anthropic'
  | 'openai'
  | 'ollama'
  | 'openrouter'
  | 'groq'

/**
 * Discover available models from configured providers.
 */
export class ModelCatalog {
  private cache = new Map<string, ModelInfo[]>()

  async discover(
    provider: ProviderName,
    opts?: { baseUrl?: string; apiKey?: string },
  ): Promise<ModelInfo[]> {
    const cached = this.cache.get(provider)
    if (cached) return cached

    try {
      const models = await fetchModels(provider, opts)
      this.cache.set(provider, models)
      return models
    } catch (err) {
      logger.warn(
        '[model-catalog]',
        `Failed to discover ${provider} models: ${err instanceof Error ? err.message : String(err)}`,
      )
      return []
    }
  }

  /** Clear cache for a specific provider or all. */
  invalidate(provider?: string): void {
    if (provider) {
      this.cache.delete(provider)
    } else {
      this.cache.clear()
    }
  }

  /** Get all cached models across providers. */
  all(): ModelInfo[] {
    return [...this.cache.values()].flat()
  }
}

async function fetchModels(
  provider: ProviderName,
  opts?: { baseUrl?: string; apiKey?: string },
): Promise<ModelInfo[]> {
  switch (provider) {
    case 'ollama':
      return fetchOllamaModels(opts?.baseUrl)
    case 'openai':
    case 'openrouter':
    case 'groq':
      return fetchOpenAICompatModels(provider, opts)
    case 'anthropic':
      // Anthropic doesn't have a list-models endpoint — return known models
      return [
        {
          id: 'claude-opus-4-6-20250514',
          provider: 'anthropic',
          name: 'Claude Opus 4.6',
        },
        {
          id: 'claude-sonnet-4-6-20250514',
          provider: 'anthropic',
          name: 'Claude Sonnet 4.6',
        },
        {
          id: 'claude-haiku-4-5-20251001',
          provider: 'anthropic',
          name: 'Claude Haiku 4.5',
        },
        {
          id: 'claude-opus-4-20250514',
          provider: 'anthropic',
          name: 'Claude Opus 4',
        },
        {
          id: 'claude-sonnet-4-20250514',
          provider: 'anthropic',
          name: 'Claude Sonnet 4',
        },
      ]
  }
}

async function fetchOllamaModels(baseUrl?: string): Promise<ModelInfo[]> {
  const url = `${baseUrl ?? 'http://localhost:11434'}/api/tags`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return []

  const data = (await res.json()) as {
    models?: Array<{ name: string; details?: { parameter_size?: string } }>
  }

  return (data.models ?? []).map((m) => ({
    id: m.name,
    provider: 'ollama',
    name: m.name,
  }))
}

async function fetchOpenAICompatModels(
  provider: string,
  opts?: { baseUrl?: string; apiKey?: string },
): Promise<ModelInfo[]> {
  const baseUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    groq: 'https://api.groq.com/openai/v1',
  }
  const baseUrl = opts?.baseUrl ?? baseUrls[provider] ?? ''
  if (!baseUrl) return []

  const headers: Record<string, string> = {}
  if (opts?.apiKey) {
    headers.Authorization = `Bearer ${opts.apiKey}`
  }

  const res = await fetch(`${baseUrl}/models`, {
    headers,
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return []

  const data = (await res.json()) as {
    data?: Array<{ id: string; name?: string }>
  }

  return (data.data ?? []).map((m) => ({
    id: m.id,
    provider,
    name: m.name ?? m.id,
  }))
}
