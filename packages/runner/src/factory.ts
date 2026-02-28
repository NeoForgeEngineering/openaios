import type { RunnerAdapter, ModelProviders, RunnerConfig } from '@openaios/core'
import { ClaudeCodeRunner } from './claude-code/runner.js'
import { OllamaRunner } from './ollama/runner.js'
import { OpenAICompatRunner } from './openai-compat/runner.js'

/**
 * Resolve a model string to a provider name.
 * Examples:
 *   "claude-code"          → "claude-code"
 *   "ollama/qwen2.5:7b"    → "ollama"
 *   "groq/llama3-8b"       → "groq"
 *   "anthropic/..."        → "anthropic"
 *   "openrouter/..."       → "openrouter"
 */
export function resolveProvider(model: string): string {
  if (model === 'claude-code') return 'claude-code'
  const slash = model.indexOf('/')
  return slash !== -1 ? model.slice(0, slash) : 'openai'
}

export function createRunner(
  model: string,
  providers: ModelProviders,
  runnerConfig: RunnerConfig
): RunnerAdapter {
  if (runnerConfig.mode === 'docker') {
    throw new Error(
      'Docker runner mode is not yet implemented. Set runner.mode to "native" in your config.'
    )
  }

  const provider = resolveProvider(model)

  switch (provider) {
    case 'claude-code': {
      const cfg = providers['claude-code']
      return new ClaudeCodeRunner({ bin: cfg?.bin })
    }

    case 'ollama': {
      const cfg = providers.ollama
      return new OllamaRunner({ baseUrl: cfg?.base_url })
    }

    case 'anthropic': {
      const cfg = providers.anthropic
      if (!cfg) throw new Error('anthropic provider config missing (api_key required)')
      return new OpenAICompatRunner({
        apiKey: cfg.api_key,
        baseUrl: cfg.base_url ?? 'https://api.anthropic.com',
        defaultModel: model.replace(/^anthropic\//, ''),
      })
    }

    case 'groq': {
      const cfg = providers.groq
      if (!cfg) throw new Error('groq provider config missing (api_key required)')
      return new OpenAICompatRunner({
        apiKey: cfg.api_key,
        baseUrl: cfg.base_url ?? 'https://api.groq.com/openai',
        defaultModel: model.replace(/^groq\//, ''),
      })
    }

    case 'openrouter': {
      const cfg = providers.openrouter
      if (!cfg) throw new Error('openrouter provider config missing (api_key required)')
      return new OpenAICompatRunner({
        apiKey: cfg.api_key,
        baseUrl: cfg.base_url ?? 'https://openrouter.ai/api',
        defaultModel: model.replace(/^openrouter\//, ''),
      })
    }

    default:
      // Treat unknown providers as OpenAI-compatible
      if (providers.openai) {
        return new OpenAICompatRunner({
          apiKey: providers.openai.api_key,
          baseUrl: providers.openai.base_url,
          defaultModel: model,
        })
      }
      throw new Error(
        `Unknown model provider "${provider}" for model "${model}". ` +
          `Add a matching provider to your models.providers config.`
      )
  }
}
