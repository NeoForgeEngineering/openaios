import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

interface AgentConfig {
  name: string
  persona: string
  skills: string[]
  capabilities: { browser: boolean; 'agent-calls': string[] }
  permissions: { allow: string[]; deny: string[] }
}

interface SkillInfo {
  name: string
  description: string
}

type Field = 'skills' | 'browser' | 'allow' | 'deny'

export function ConfigPanel({ baseUrl }: { baseUrl: string }): React.ReactElement {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<AgentConfig | null>(null)
  const [focusField, setFocusField] = useState<Field>('skills')
  const [focusSkillIdx, setFocusSkillIdx] = useState(0)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    try {
      const [cfgRes, skillsRes] = await Promise.all([
        fetch(`${baseUrl}/api/config`),
        fetch(`${baseUrl}/api/skills`),
      ])
      const cfgData = (await cfgRes.json()) as { agents: AgentConfig[] }
      const skillsData = (await skillsRes.json()) as { skills: SkillInfo[] }
      setAgents(cfgData.agents ?? [])
      setSkills(skillsData.skills ?? [])
    } catch {/* ignore */}
  }, [baseUrl])

  useEffect(() => { void load() }, [load])

  const selectAgent = (idx: number) => {
    setSelectedIdx(idx)
    const a = agents[idx]
    if (a) {
      setEditData(structuredClone(a))
      setEditing(true)
      setFocusField('skills')
      setFocusSkillIdx(0)
    }
  }

  const save = async () => {
    if (!editData) return
    try {
      const res = await fetch(`${baseUrl}/api/config/agents/${encodeURIComponent(editData.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona: editData.persona,
          skills: editData.skills,
          capabilities: { browser: editData.capabilities.browser },
          permissions: { allow: editData.permissions.allow, deny: editData.permissions.deny },
        }),
      })
      if (res.status === 204) {
        setAgents((prev) => prev.map((a) => a.name === editData.name ? editData : a))
        setToast('✓ Saved')
        setTimeout(() => setToast(''), 2000)
      } else {
        setToast(`✗ Error ${res.status}`)
        setTimeout(() => setToast(''), 3000)
      }
    } catch (err) {
      setToast(`✗ ${String(err)}`)
      setTimeout(() => setToast(''), 3000)
    }
  }

  const editPersonaInEditor = () => {
    if (!editData) return
    const editor = process.env['EDITOR'] ?? 'vi'
    const dir = mkdtempSync(join(tmpdir(), 'openaios-'))
    const file = join(dir, 'persona.md')
    writeFileSync(file, editData.persona, 'utf-8')
    spawnSync(editor, [file], { stdio: 'inherit' })
    const updated = readFileSync(file, 'utf-8')
    setEditData((prev) => prev ? { ...prev, persona: updated } : prev)
  }

  const fields: Field[] = ['skills', 'browser', 'allow', 'deny']

  useInput((input, key) => {
    if (!editing) {
      if (key.upArrow) setSelectedIdx((i) => Math.max(0, i - 1))
      if (key.downArrow) setSelectedIdx((i) => Math.min(agents.length - 1, i + 1))
      if (key.return && agents.length > 0) selectAgent(selectedIdx)
      return
    }

    if (key.escape) { setEditing(false); return }
    if (input === 's') { void save(); return }
    if (input === 'p') { editPersonaInEditor(); return }

    if (key.tab) {
      const fi = fields.indexOf(focusField)
      setFocusField(fields[(fi + 1) % fields.length]!)
      setFocusSkillIdx(0)
      return
    }

    if (focusField === 'skills') {
      if (key.upArrow) setFocusSkillIdx((i) => Math.max(0, i - 1))
      if (key.downArrow) setFocusSkillIdx((i) => Math.min(skills.length - 1, i + 1))
      if (input === ' ') {
        const skill = skills[focusSkillIdx]
        if (skill && editData) {
          const has = editData.skills.includes(skill.name)
          setEditData({ ...editData, skills: has
            ? editData.skills.filter((s) => s !== skill.name)
            : [...editData.skills, skill.name] })
        }
      }
    }

    if (focusField === 'browser' && input === ' ' && editData) {
      setEditData({ ...editData, capabilities: { ...editData.capabilities, browser: !editData.capabilities.browser } })
    }
  })

  if (agents.length === 0) {
    return <Text color="gray">Loading config...</Text>
  }

  return (
    <Box flexDirection="row" gap={2}>
      {/* Agent list */}
      <Box flexDirection="column" width={20}>
        <Text bold color="gray">AGENTS</Text>
        {agents.map((a, i) => (
          <Text key={a.name} color={i === selectedIdx ? 'white' : 'gray'}>
            {i === selectedIdx ? '> ' : '  '}{a.name}
          </Text>
        ))}
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">↑↓ navigate</Text>
          <Text color="gray">Enter select</Text>
        </Box>
      </Box>

      {/* Edit form */}
      {editData ? (
        <Box flexDirection="column" gap={1}>
          <Text bold>EDIT: {editData.name}</Text>

          <Box flexDirection="column">
            <Text color="gray">[p] Edit persona in $EDITOR</Text>
            <Text color="gray" dimColor>{editData.persona.slice(0, 60)}{editData.persona.length > 60 ? '…' : ''}</Text>
          </Box>

          <Box flexDirection="column">
            <Text bold={focusField === 'skills'} color={focusField === 'skills' ? 'white' : 'gray'}>
              Skills: {focusField === 'skills' ? '(Space=toggle Tab=next)' : ''}
            </Text>
            {skills.length === 0 && <Text color="gray">  No skills available</Text>}
            {skills.map((s, i) => {
              const on = editData.skills.includes(s.name)
              const focused = focusField === 'skills' && i === focusSkillIdx
              return (
                <Text key={s.name} color={focused ? 'white' : 'gray'}>
                  {focused ? '>' : ' '} [{on ? 'x' : ' '}] {s.name}
                </Text>
              )
            })}
          </Box>

          <Box flexDirection="column">
            <Text bold={focusField === 'browser'} color={focusField === 'browser' ? 'white' : 'gray'}>
              Capabilities: {focusField === 'browser' ? '(Space=toggle Tab=next)' : ''}
            </Text>
            <Text color="gray">  [{editData.capabilities.browser ? 'x' : ' '}] Browser</Text>
          </Box>

          <Box flexDirection="column">
            <Text bold={focusField === 'allow'} color={focusField === 'allow' ? 'white' : 'gray'}>
              Permissions allow:
            </Text>
            <Text color="gray">  {editData.permissions.allow.join(', ') || '(none)'}</Text>
          </Box>

          <Box flexDirection="column">
            <Text bold={focusField === 'deny'} color={focusField === 'deny' ? 'white' : 'gray'}>
              Permissions deny:
            </Text>
            <Text color="gray">  {editData.permissions.deny.join(', ') || '(none)'}</Text>
          </Box>

          <Box gap={2}>
            <Text color="green">[s] Save</Text>
            <Text color="gray">[Esc] Cancel</Text>
            <Text color="gray">[p] Edit persona</Text>
            {toast && <Text color={toast.startsWith('✓') ? 'green' : 'red'}>{toast}</Text>}
          </Box>
        </Box>
      ) : (
        <Text color="gray">Press Enter to select an agent</Text>
      )}
    </Box>
  )
}
