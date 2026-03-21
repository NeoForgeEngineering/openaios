import type { CanvasComponent } from '../a2ui-protocol.js'

export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut'

export interface ChartDataset {
  label: string
  data: number[]
  color?: string
}

export function createChart(
  id: string,
  opts: {
    title?: string
    type: ChartType
    labels: string[]
    datasets: ChartDataset[]
    order?: number
  },
): CanvasComponent {
  return {
    id,
    type: 'chart',
    props: {
      ...(opts.title !== undefined && { title: opts.title }),
      chartType: opts.type,
      labels: opts.labels,
      datasets: opts.datasets,
    },
    ...(opts.order !== undefined && { order: opts.order }),
  }
}
