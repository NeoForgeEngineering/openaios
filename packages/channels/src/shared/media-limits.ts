import type { Attachment } from '@openaios/core'

export interface MediaLimitsConfig {
  maxSizeBytes?: number
  allowedTypes?: Array<'image' | 'audio' | 'video' | 'file'>
}

/**
 * Validate attachments against per-channel media limits.
 */
export function filterAttachments(
  attachments: Attachment[],
  limits?: MediaLimitsConfig,
): { allowed: Attachment[]; rejected: Attachment[] } {
  if (!limits) return { allowed: attachments, rejected: [] }

  const allowed: Attachment[] = []
  const rejected: Attachment[] = []

  for (const att of attachments) {
    let ok = true

    if (limits.allowedTypes && !limits.allowedTypes.includes(att.type)) {
      ok = false
    }

    if (
      limits.maxSizeBytes !== undefined &&
      att.size !== undefined &&
      att.size > limits.maxSizeBytes
    ) {
      ok = false
    }

    if (ok) {
      allowed.push(att)
    } else {
      rejected.push(att)
    }
  }

  return { allowed, rejected }
}
