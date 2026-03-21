import type {
  AgentConfig,
  ModelProviders,
  RunnerAdapter,
  RunnerConfig,
} from '@openaios/core'
import { ClaudeCodeRunner } from './claude-code/runner.js'
import type { ContainerOrchestrator } from './docker/orchestrator.js'
import { DockerRunner } from './docker/runner.js'
import { ExternalAgentRunner } from './external/runner.js'
import type { ToolGate } from './providers/anthropic-sdk.js'
import { OpenAiSdkRunner } from './providers/openai-sdk.js'

export interface CreateRunnerOptions {
  /** Required when runnerConfig.env === 'docker' */
  orchestrator?: ContainerOrchestrator
  /**
   * Governed tool executor — when provided, external runners use
   * OpenAiSdkRunner with a full tool-use loop instead of the
   * chat-only ExternalAgentRunner.
   */
  toolGate?: ToolGate
}

export function createRunner(
  agentConfig: AgentConfig,
  providers: ModelProviders,
  runnerConfig: RunnerConfig,
  options?: CreateRunnerOptions,
): RunnerAdapter {
  if (runnerConfig.env === 'external') {
    if (!runnerConfig.external?.base_url) {
      throw new Error(
        'External mode requires runner.external.base_url in openAIOS.yml',
      )
    }

    // When a ToolGate is provided, use the governed OpenAI SDK runner
    // with full tool-use loop. Every tool call goes through governance.
    if (options?.toolGate) {
      return new OpenAiSdkRunner(agentConfig, {
        apiKey: runnerConfig.external.api_key ?? '',
        baseUrl: runnerConfig.external.base_url,
        toolGate: options.toolGate,
      })
    }

    // Fallback: chat-only external runner (no tool governance)
    return new ExternalAgentRunner(agentConfig, {
      baseUrl: runnerConfig.external.base_url,
      ...(runnerConfig.external.api_key !== undefined && {
        apiKey: runnerConfig.external.api_key,
      }),
    })
  }

  const llmEnv = resolveLlmEnv(runnerConfig)

  if (runnerConfig.env === 'docker') {
    if (!options?.orchestrator) {
      throw new Error(
        'Docker mode requires ContainerOrchestrator (pass via options.orchestrator)',
      )
    }
    return new DockerRunner(agentConfig, {
      orchestrator: options.orchestrator,
      llmEnv,
      ...(runnerConfig.docker !== undefined && {
        containerConfig: runnerConfig.docker,
      }),
    })
  }

  // native — all use ClaudeCodeRunner, just with different LLM env vars
  const cfg = providers['claude-code']
  return new ClaudeCodeRunner(agentConfig, {
    ...(cfg?.bin !== undefined && { bin: cfg.bin }),
    llmEnv,
  })
}

/**
 * Resolve ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN for a given llm type.
 * These are injected into the claude process env (or docker exec -e flags).
 */
function resolveLlmEnv(runnerConfig: RunnerConfig): Record<string, string> {
  const { llm, llm_config } = runnerConfig

  if (llm === 'claude-code') {
    // Standard Anthropic API — use ANTHROPIC_API_KEY from environment
    return {}
  }

  // All non-claude-code LLMs route via ANTHROPIC_BASE_URL to a gateway
  // (LiteLLM, claude-code-router, or any Anthropic-compat proxy)
  if (!llm_config?.base_url) {
    throw new Error(
      `runner.llm_config.base_url is required when runner.llm is "${llm}".\n` +
        `Set up a gateway (e.g. LiteLLM) that translates to Anthropic API format.`,
    )
  }

  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: llm_config.base_url,
  }

  if (llm_config.api_key) {
    env.ANTHROPIC_AUTH_TOKEN = llm_config.api_key
  }

  return env
}
