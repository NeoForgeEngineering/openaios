import type { CanvasComponent } from '../a2ui-protocol.js'

export function createMarkdown(
  id: string,
  opts: { content: string; order?: number },
): CanvasComponent {
  return {
    id,
    type: 'markdown',
    props: { content: opts.content },
    ...(opts.order !== undefined && { order: opts.order }),
  }
}
