import { readFileSync, writeFileSync } from 'node:fs'
import { isMap, isSeq, parseDocument } from 'yaml'

export interface AgentPatch {
  persona?: string
  skills?: string[]
  allowedTools?: string[] // permissions.allow
  deniedTools?: string[] // permissions.deny
  browser?: boolean // capabilities.browser
}

export function patchAgentInConfig(
  configPath: string,
  agentName: string,
  patch: AgentPatch,
): void {
  const raw = readFileSync(configPath, 'utf-8')
  const doc = parseDocument(raw)
  const agents = doc.get('agents')
  if (!isSeq(agents)) throw new Error('agents must be a sequence')

  const idx = agents.items.findIndex(
    (item) => isMap(item) && item.get('name') === agentName,
  )
  if (idx === -1) throw new Error(`Agent "${agentName}" not found in config`)

  if (patch.persona !== undefined)
    doc.setIn(['agents', idx, 'persona'], patch.persona)
  if (patch.skills !== undefined)
    doc.setIn(['agents', idx, 'skills'], patch.skills)
  if (patch.allowedTools !== undefined)
    doc.setIn(['agents', idx, 'permissions', 'allow'], patch.allowedTools)
  if (patch.deniedTools !== undefined)
    doc.setIn(['agents', idx, 'permissions', 'deny'], patch.deniedTools)
  if (patch.browser !== undefined)
    doc.setIn(['agents', idx, 'capabilities', 'browser'], patch.browser)

  writeFileSync(configPath, doc.toString(), 'utf-8')
}
