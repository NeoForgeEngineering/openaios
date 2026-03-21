import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'

const InputSchema = z.object({
  query: z.string().min(1),
  count: z.number().int().min(1).max(20).optional(),
})

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export type SearchProvider = 'brave' | 'searxng' | 'tavily'

export function createWebSearchTool(opts: {
  provider: SearchProvider
  apiKey?: string
  baseUrl?: string
}): ToolDefinition {
  return {
    name: 'web_search',
    description:
      'Search the web for a query. Returns a list of results with title, URL, and snippet.',
    inputSchema: InputSchema,
    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      const { query, count = 5 } = parsed.data

      try {
        const results = await search(opts, query, count)
        return { type: 'json', content: { results } }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { type: 'error', content: `Search failed: ${message}` }
      }
    },
  }
}

async function search(
  opts: { provider: SearchProvider; apiKey?: string; baseUrl?: string },
  query: string,
  count: number,
): Promise<SearchResult[]> {
  switch (opts.provider) {
    case 'brave':
      return searchBrave(query, count, opts.apiKey)
    case 'searxng':
      return searchSearXNG(query, count, opts.baseUrl)
    case 'tavily':
      return searchTavily(query, count, opts.apiKey)
  }
}

async function searchBrave(
  query: string,
  count: number,
  apiKey?: string,
): Promise<SearchResult[]> {
  if (!apiKey) throw new Error('Brave Search requires an API key')

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(count))

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    web?: {
      results?: Array<{ title: string; url: string; description: string }>
    }
  }

  return (data.web?.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description,
  }))
}

async function searchSearXNG(
  query: string,
  count: number,
  baseUrl?: string,
): Promise<SearchResult[]> {
  const base = baseUrl ?? 'http://localhost:8080'
  const url = new URL('/search', base)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('pageno', '1')

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`SearXNG error: ${response.status}`)
  }

  const data = (await response.json()) as {
    results?: Array<{ title: string; url: string; content: string }>
  }

  return (data.results ?? []).slice(0, count).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }))
}

async function searchTavily(
  query: string,
  count: number,
  apiKey?: string,
): Promise<SearchResult[]> {
  if (!apiKey) throw new Error('Tavily Search requires an API key')

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: count,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    results?: Array<{ title: string; url: string; content: string }>
  }

  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }))
}
