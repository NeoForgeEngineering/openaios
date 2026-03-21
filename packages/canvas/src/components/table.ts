import type { CanvasComponent } from '../a2ui-protocol.js'

export interface TableColumn {
  key: string
  label: string
  sortable?: boolean
}

export function createTable(
  id: string,
  opts: {
    title?: string
    columns: TableColumn[]
    rows: Record<string, unknown>[]
    order?: number
  },
): CanvasComponent {
  return {
    id,
    type: 'table',
    props: {
      ...(opts.title !== undefined && { title: opts.title }),
      columns: opts.columns,
      rows: opts.rows,
    },
    ...(opts.order !== undefined && { order: opts.order }),
  }
}
