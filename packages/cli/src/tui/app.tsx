import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { StatusPanel } from './panels/StatusPanel.js'
import { LogsPanel } from './panels/LogsPanel.js'
import { ConfigPanel } from './panels/ConfigPanel.js'

type Tab = 1 | 2 | 3

const TAB_LABELS: Record<Tab, string> = {
  1: 'Status',
  2: 'Logs',
  3: 'Configure',
}

export function TuiApp({ baseUrl }: { baseUrl: string }): React.ReactElement {
  const [tab, setTab] = useState<Tab>(1)
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
      return
    }
    if (input === '1') setTab(1)
    if (input === '2') setTab(2)
    if (input === '3') setTab(3)
  })

  return (
    <Box flexDirection="column" width="100%">
      {/* Header */}
      <Box paddingX={1} justifyContent="space-between">
        <Box gap={2}>
          <Text bold color="white">openAIOS</Text>
          {([1, 2, 3] as Tab[]).map((t) => (
            <Text key={t} color={tab === t ? 'green' : 'gray'} bold={tab === t}>
              [{t}] {TAB_LABELS[t]}
            </Text>
          ))}
        </Box>
        <Text color="gray">q: quit</Text>
      </Box>

      {/* Divider */}
      <Box>
        <Text color="gray">{'─'.repeat(80)}</Text>
      </Box>

      {/* Active panel */}
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {tab === 1 && <StatusPanel baseUrl={baseUrl} />}
        {tab === 2 && <LogsPanel baseUrl={baseUrl} />}
        {tab === 3 && <ConfigPanel baseUrl={baseUrl} />}
      </Box>
    </Box>
  )
}
