export type ReasoningMode = 'standard' | 'fast' | 'deep'

/**
 * Build claude CLI args for reasoning mode.
 */
export function reasoningArgs(mode: ReasoningMode): string[] {
  switch (mode) {
    case 'fast':
      return ['--thinking-budget', '0']
    case 'deep':
      return ['--thinking-budget', '32000']
    default:
      return []
  }
}

/**
 * Map reasoning mode to model selection hint.
 * Deep reasoning benefits from more capable models.
 */
export function suggestModel(
  mode: ReasoningMode,
  defaultModel: string,
  premiumModel?: string,
): string {
  if (mode === 'deep' && premiumModel) {
    return premiumModel
  }
  return defaultModel
}
