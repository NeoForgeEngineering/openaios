import type { CanvasComponent } from '../a2ui-protocol.js'

export function createButton(
  id: string,
  opts: {
    label: string
    actionType: string
    variant?: 'primary' | 'secondary' | 'danger'
    data?: Record<string, unknown>
    order?: number
  },
): CanvasComponent {
  return {
    id,
    type: 'button',
    props: {
      label: opts.label,
      actionType: opts.actionType,
      variant: opts.variant ?? 'primary',
      ...(opts.data !== undefined && { data: opts.data }),
    },
    ...(opts.order !== undefined && { order: opts.order }),
  }
}
