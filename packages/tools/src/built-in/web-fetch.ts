import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'

const InputSchema = z.object({
  url: z.string().url(),
})

export function createWebFetchTool(opts?: {
  urlAllowlist?: string[]
  urlDenylist?: string[]
}): ToolDefinition {
  return {
    name: 'web_fetch',
    description:
      'Fetch the content of a URL. Returns the response body as text.',
    inputSchema: InputSchema,
    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      const { url } = parsed.data

      // SSRF protection — block dangerous protocols and internal networks
      const ssrfCheck = checkSsrf(url)
      if (ssrfCheck) {
        return { type: 'error', content: ssrfCheck }
      }

      if (opts?.urlDenylist) {
        for (const pattern of opts.urlDenylist) {
          if (matchGlob(url, pattern)) {
            return { type: 'error', content: 'URL denied by policy' }
          }
        }
      }

      if (opts?.urlAllowlist && opts.urlAllowlist.length > 0) {
        const allowed = opts.urlAllowlist.some((pattern) =>
          matchGlob(url, pattern),
        )
        if (!allowed) {
          return { type: 'error', content: 'URL not in allowlist' }
        }
      }

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'openaios/1.0' },
          signal: AbortSignal.timeout(30_000),
        })

        if (!response.ok) {
          return {
            type: 'error',
            content: `HTTP ${response.status}: ${response.statusText}`,
          }
        }

        const text = await response.text()
        return { type: 'text', content: text }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { type: 'error', content: `Fetch failed: ${message}` }
      }
    },
  }
}

/** SSRF protection — block dangerous URLs before fetch */
function checkSsrf(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'Invalid URL'
  }

  // Block non-HTTP protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Blocked protocol: ${parsed.protocol} — only http/https allowed`
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block localhost variants
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname === '0.0.0.0'
  ) {
    return 'Blocked: localhost access not allowed'
  }

  // Block cloud metadata endpoints
  if (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal'
  ) {
    return 'Blocked: cloud metadata endpoint'
  }

  // Block private/internal IP ranges
  const parts = hostname.split('.').map(Number)
  if (parts.length === 4 && parts.every((p) => !Number.isNaN(p))) {
    const [a, b] = parts
    if (a === 10) return 'Blocked: private network (10.x.x.x)'
    if (a === 172 && b !== undefined && b >= 16 && b <= 31)
      return 'Blocked: private network (172.16-31.x.x)'
    if (a === 192 && b === 168) return 'Blocked: private network (192.168.x.x)'
    if (a === 169 && b === 254) return 'Blocked: link-local address'
  }

  return null
}

/** Simple glob matching: * matches any sequence of non-/ chars */
function matchGlob(url: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
  return new RegExp(`^${escaped}$`).test(url)
}
