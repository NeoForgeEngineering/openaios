import type {
  AgentConfig,
  ModelProviders,
  RunnerAdapter,
  RunnerConfig,
} from '@openaios/core'
import { ClaudeCodeRunner } from './claude-code/runner.js'
import type { ContainerOrchestrator } from './docker/orchestrator.js'
import { DockerRunner } from './docker/runner.js'
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

export interface CreateRunnerOptions {
  /** Required when runnerConfig.mode === 'docker' */
  orchestrator?: ContainerOrchestrator
}

export function createRunner(
  agentConfig: AgentConfig,
  providers: ModelProviders,
  runnerConfig: RunnerConfig,
  options?: CreateRunnerOptions,
): RunnerAdapter {
  if (runnerConfig.mode === 'docker') {
    if (!options?.orchestrator) {
      throw new Error(
        'Docker mode requires ContainerOrchestrator (pass via options.orchestrator)',
      )
    }
    return new DockerRunner(agentConfig, {
      orchestrator: options.orchestrator,
      ...(runnerConfig.docker !== undefined && {
        containerConfig: runnerConfig.docker,
      }),
    })
  }

  const provider = resolveProvider(agentConfig.defaultModel)

  switch (provider) {
    case 'claude-code': {
      const cfg = providers['claude-code']
      return new ClaudeCodeRunner(agentConfig, cfg?.bin ? { bin: cfg.bin } : {})
    }

    case 'ollama': {
      const cfg = providers.ollama
      return new OllamaRunner(
        agentConfig,
        cfg?.base_url ? { baseUrl: cfg.base_url } : {},
      )
    }

    case 'anthropic': {
      const cfg = providers.anthropic
      if (!cfg)
        throw new Error('anthropic provider config missing (api_key required)')
      return new OpenAICompatRunner(agentConfig, {
        apiKey: cfg.api_key,
        baseUrl: cfg.base_url ?? 'https://api.anthropic.com',
      })
    }

    case 'groq': {
      const cfg = providers.groq
      if (!cfg)
        throw new Error('groq provider config missing (api_key required)')
      return new OpenAICompatRunner(agentConfig, {
        apiKey: cfg.api_key,
        baseUrl: cfg.base_url ?? 'https://api.groq.com/openai',
      })
    }

    case 'openrouter': {
      const cfg = providers.openrouter
      if (!cfg)
        throw new Error('openrouter provider config missing (api_key required)')
      return new OpenAICompatRunner(agentConfig, {
        apiKey: cfg.api_key,
        baseUrl: cfg.base_url ?? 'https://openrouter.ai/api',
      })
    }

    default:
      // Treat unknown providers as OpenAI-compatible
      if (providers.openai) {
        return new OpenAICompatRunner(agentConfig, {
          apiKey: providers.openai.api_key,
          ...(providers.openai.base_url && {
            baseUrl: providers.openai.base_url,
          }),
        })
      }
      throw new Error(
        `Unknown model provider "${provider}" for model "${agentConfig.defaultModel}". ` +
          `Add a matching provider to your models.providers config.`,
      )
  }
}
