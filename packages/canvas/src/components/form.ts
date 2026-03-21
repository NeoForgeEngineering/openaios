import type { CanvasComponent } from '../a2ui-protocol.js'

export interface FormField {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea'
  required?: boolean
  options?: string[] // for select
  defaultValue?: string | number | boolean
}

export function createForm(
  id: string,
  opts: {
    title: string
    fields: FormField[]
    submitLabel?: string
    order?: number
  },
): CanvasComponent {
  return {
    id,
    type: 'form',
    props: {
      title: opts.title,
      fields: opts.fields,
      submitLabel: opts.submitLabel ?? 'Submit',
    },
    ...(opts.order !== undefined && { order: opts.order }),
  }
}
