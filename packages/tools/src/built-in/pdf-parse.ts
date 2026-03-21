import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'

const InputSchema = z
  .object({
    url: z.string().url().optional(),
    base64: z.string().optional(),
  })
  .refine((data) => data.url || data.base64, {
    message: 'Either url or base64 must be provided',
  })

export function createPdfParseTool(): ToolDefinition {
  return {
    name: 'pdf_parse',
    description:
      'Extract text content from a PDF document. Provide either a URL to fetch or base64-encoded content.',
    inputSchema: InputSchema,
    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      try {
        let buffer: ArrayBuffer

        if (parsed.data.url) {
          const response = await fetch(parsed.data.url, {
            signal: AbortSignal.timeout(30_000),
          })
          if (!response.ok) {
            return {
              type: 'error',
              content: `HTTP ${response.status}: ${response.statusText}`,
            }
          }
          buffer = await response.arrayBuffer()
        } else {
          buffer = Buffer.from(parsed.data.base64!, 'base64').buffer
        }

        // Lazy-load pdf-parse to keep it as an optional peer dependency
        let pdfParse: (data: Buffer) => Promise<{ text: string }>
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const mod = await (Function(
            'return import("pdf-parse")',
          )() as Promise<{
            default?: (data: Buffer) => Promise<{ text: string }>
          }>)
          pdfParse =
            mod.default ??
            (mod as unknown as (data: Buffer) => Promise<{ text: string }>)
        } catch {
          return {
            type: 'error',
            content: 'pdf-parse is not installed. Run: pnpm add pdf-parse',
          }
        }

        const result = await pdfParse(Buffer.from(buffer))
        return { type: 'text', content: result.text }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { type: 'error', content: `PDF parse failed: ${message}` }
      }
    },
  }
}
