import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { AgentConfig, ModelProviders, RunnerConfig } from '@openaios/core'
import { ClaudeCodeRunner } from '../claude-code/runner.js'
import { DockerRunner } from '../docker/runner.js'
import { ExternalAgentRunner } from '../external/runner.js'
import { createRunner } from '../factory.js'

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    agentName: 'test-agent',
    systemPrompt: 'You are helpful.',
    defaultModel: 'claude-sonnet-4-6',
    allowedTools: [],
    deniedTools: [],
    workspacesDir: '/tmp/workspaces',
    memoryDir: '/tmp/memory',
    ...overrides,
  }
}

const mockOrchestrator = {
  ensureRunning: async () => {},
  isRunning: async () => true,
  exec: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  stopAll: async () => {},
} as unknown as import('../docker/orchestrator.js').ContainerOrchestrator

const emptyProviders: ModelProviders = {}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createRunner — dispatch matrix', () => {
  test('claude-code native → ClaudeCodeRunner with no llmEnv', () => {
    const runnerConfig: RunnerConfig = { env: 'native', llm: 'claude-code' }
    const runner = createRunner(makeAgentConfig(), emptyProviders, runnerConfig)
    assert.ok(runner instanceof ClaudeCodeRunner)
    // llmEnv should be empty — no ANTHROPIC_BASE_URL injected
    const llmEnv0 = (runner as unknown as { llmEnv: Record<string, string> })
      .llmEnv
    assert.strictEqual(llmEnv0.ANTHROPIC_BASE_URL, undefined)
  })

  test('openai-compat native → ClaudeCodeRunner with ANTHROPIC_BASE_URL', () => {
    const runnerConfig: RunnerConfig = {
      env: 'native',
      llm: 'openai-compat',
      llm_config: { base_url: 'http://localhost:4000', api_key: 'sk-test' },
    }
    const runner = createRunner(makeAgentConfig(), emptyProviders, runnerConfig)
    assert.ok(runner instanceof ClaudeCodeRunner)
    const llmEnv = (runner as unknown as { llmEnv: Record<string, string> })
      .llmEnv
    assert.strictEqual(llmEnv.ANTHROPIC_BASE_URL, 'http://localhost:4000')
    assert.strictEqual(llmEnv.ANTHROPIC_AUTH_TOKEN, 'sk-test')
  })

  test('openai-compat native without base_url → throws', () => {
    const runnerConfig: RunnerConfig = {
      env: 'native',
      llm: 'openai-compat',
      // llm_config intentionally omitted
    }
    assert.throws(
      () => createRunner(makeAgentConfig(), emptyProviders, runnerConfig),
      /llm_config\.base_url is required/,
    )
  })

  test('docker claude-code → DockerRunner with no llmEnv', () => {
    const runnerConfig: RunnerConfig = { env: 'docker', llm: 'claude-code' }
    const runner = createRunner(
      makeAgentConfig(),
      emptyProviders,
      runnerConfig,
      {
        orchestrator: mockOrchestrator,
      },
    )
    assert.ok(runner instanceof DockerRunner)
    assert.deepStrictEqual(
      (runner as unknown as { llmEnv: Record<string, string> }).llmEnv,
      {},
    )
  })

  test('docker openai-compat → DockerRunner with ANTHROPIC_BASE_URL env flag', () => {
    const runnerConfig: RunnerConfig = {
      env: 'docker',
      llm: 'openai-compat',
      llm_config: { base_url: 'http://host.docker.internal:4000' },
    }
    const runner = createRunner(
      makeAgentConfig(),
      emptyProviders,
      runnerConfig,
      {
        orchestrator: mockOrchestrator,
      },
    )
    assert.ok(runner instanceof DockerRunner)
    const llmEnv = (runner as unknown as { llmEnv: Record<string, string> })
      .llmEnv
    assert.strictEqual(
      llmEnv.ANTHROPIC_BASE_URL,
      'http://host.docker.internal:4000',
    )
  })

  test('docker mode without orchestrator → throws', () => {
    const runnerConfig: RunnerConfig = { env: 'docker', llm: 'claude-code' }
    assert.throws(
      () => createRunner(makeAgentConfig(), emptyProviders, runnerConfig),
      /orchestrator/,
    )
  })

  test('external → ExternalAgentRunner with baseUrl', () => {
    const runnerConfig: RunnerConfig = {
      env: 'external',
      llm: 'claude-code',
      external: { base_url: 'http://localhost:18789/v1' },
    }
    const runner = createRunner(makeAgentConfig(), emptyProviders, runnerConfig)
    assert.ok(runner instanceof ExternalAgentRunner)
    assert.strictEqual(
      (runner as unknown as { baseUrl: string }).baseUrl,
      'http://localhost:18789/v1',
    )
  })

  test('external → ExternalAgentRunner with api_key', () => {
    const runnerConfig: RunnerConfig = {
      env: 'external',
      llm: 'claude-code',
      external: { base_url: 'http://localhost:18789/v1', api_key: 'test-key' },
    }
    const runner = createRunner(makeAgentConfig(), emptyProviders, runnerConfig)
    assert.ok(runner instanceof ExternalAgentRunner)
    assert.strictEqual(
      (runner as unknown as { apiKey: string }).apiKey,
      'test-key',
    )
  })

  test('external without base_url → throws', () => {
    const runnerConfig = {
      env: 'external' as const,
      llm: 'claude-code' as const,
      // external intentionally omitted
    } as RunnerConfig
    assert.throws(
      () => createRunner(makeAgentConfig(), emptyProviders, runnerConfig),
      /runner\.external\.base_url/,
    )
  })
})
