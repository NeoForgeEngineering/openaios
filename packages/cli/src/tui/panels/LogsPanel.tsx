import React from 'react'
import { Box, Text } from 'ink'
import { useApiLogs } from '../hooks/useApi.js'

export function LogsPanel({ baseUrl }: { baseUrl: string }): React.ReactElement {
  const logs = useApiLogs(baseUrl)
  const visible = logs.slice(-30)

  return (
    <Box flexDirection="column">
      {visible.length === 0 && <Text color="gray">No log entries yet</Text>}
      {visible.map((entry, i) => {
        const ts = entry.ts.replace('T', ' ').slice(0, 19)
        const colorMap: Record<string, 'gray' | 'white' | 'yellow' | 'red'> = {
          debug: 'gray', info: 'white', warn: 'yellow', error: 'red',
        }
        const color = colorMap[entry.level] ?? 'white'
        return (
          <Text key={i} color={color}>
            {ts} {entry.level.toUpperCase().padEnd(5)} {entry.tag} {entry.msg}
          </Text>
        )
      })}
    </Box>
  )
}
