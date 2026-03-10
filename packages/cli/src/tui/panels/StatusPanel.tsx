import { Box, Text } from 'ink'
import type React from 'react'
import { useApiPolling } from '../hooks/useApi.js'

interface AgentStatus {
  name: string
  model: string
  runnerEnv: string
  runnerLlm: string
  sessionCount: number
  budget?: {
    spentUsd: number
    limitUsd: number
    fraction: number
    isWarning: boolean
  }
}

interface StatusData {
  agents: AgentStatus[]
  uptime: number
}

function budgetBar(fraction: number, width = 20): string {
  const filled = Math.round(Math.min(fraction, 1) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export function StatusPanel({
  baseUrl,
}: {
  baseUrl: string
}): React.ReactElement {
  const data = useApiPolling<StatusData>(`${baseUrl}/api/status`, 3000)

  if (!data) {
    return <Text color="gray">Loading...</Text>
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="gray">uptime: {formatUptime(data.uptime)}</Text>
      {data.agents.map((a) => (
        <Box
          key={a.name}
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          <Text bold color="white">
            {a.name}
          </Text>
          <Text color="gray">
            {a.model} {a.runnerEnv === 'native' ? '[HOST]' : '[DOCKER]'}{' '}
            {a.runnerLlm} sessions: {a.sessionCount}
          </Text>
          {a.budget && (
            <Box flexDirection="column">
              <Text
                color={
                  a.budget.fraction >= 1
                    ? 'red'
                    : a.budget.isWarning
                      ? 'yellow'
                      : 'green'
                }
              >
                {budgetBar(a.budget.fraction)}{' '}
                {(a.budget.fraction * 100).toFixed(1)}%
              </Text>
              <Text color="gray">
                ${a.budget.spentUsd.toFixed(4)} / $
                {a.budget.limitUsd.toFixed(2)}
              </Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}
