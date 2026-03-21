import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'

const InputSchema = z
  .object({
    url: z.string().url().optional(),
    base64: z.string().optional(),
    prompt: z.string().optional(),
  })
  .refine((data) => data.url || data.base64, {
    message: 'Either url or base64 must be provided',
  })

export function createImageAnalyzeTool(opts?: {
  apiKey?: string
  model?: string
  baseUrl?: string
}): ToolDefinition {
  return {
    name: 'image_analyze',
    description:
      'Analyze an image using a vision-capable LLM. Provide either a URL or base64-encoded image.',
    inputSchema: InputSchema,
    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        return {
          type: 'error',
          content: 'No API key configured for image analysis',
        }
      }

      const model = opts?.model ?? 'claude-sonnet-4-20250514'
      const baseUrl = opts?.baseUrl ?? 'https://api.anthropic.com'
      const prompt = parsed.data.prompt ?? 'Describe this image in detail.'

      try {
        const imageContent = parsed.data.url
          ? {
              type: 'image' as const,
              source: {
                type: 'url' as const,
                url: parsed.data.url,
              },
            }
          : {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: 'image/png' as const,
                data: parsed.data.base64!,
              },
            }

        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            messages: [
              {
                role: 'user',
                content: [imageContent, { type: 'text', text: prompt }],
              },
            ],
          }),
          signal: AbortSignal.timeout(60_000),
        })

        if (!response.ok) {
          const body = await response.text()
          return {
            type: 'error',
            content: `API error ${response.status}: ${body}`,
          }
        }

        const data = (await response.json()) as {
          content: Array<{ type: string; text?: string }>
        }

        const text = data.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n')

        return { type: 'text', content: text }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          type: 'error',
          content: `Image analysis failed: ${message}`,
        }
      }
    },
  }
}
