import { readFileSync, writeFileSync } from 'node:fs'
import { isMap, isSeq, parseDocument } from 'yaml'

export interface ChannelPatch {
  telegram?: { token: string } | null
  slack?: { token: string; app_token: string; signing_secret?: string } | null
  whatsapp?: { session_name?: string } | null
  signal?: { phone_number: string } | null
  webhook?: { path: string; secret?: string } | null
  discord?: { token: string; guildId?: string } | null
  google_chat?: { path: string } | null
  imessage?: { poll_interval_ms?: number } | null
}

export interface AgentPatch {
  persona?: string
  model?: { default: string; premium?: string }
  skills?: string[]
  allowedTools?: string[] // permissions.allow
  deniedTools?: string[] // permissions.deny
  browser?: boolean // capabilities.browser
  channels?: ChannelPatch
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
  if (patch.model !== undefined) {
    doc.setIn(['agents', idx, 'model', 'default'], patch.model.default)
    if (patch.model.premium !== undefined) {
      doc.setIn(['agents', idx, 'model', 'premium'], patch.model.premium)
    }
  }
  if (patch.channels !== undefined) {
    for (const [channel, value] of Object.entries(patch.channels)) {
      if (value === null) {
        doc.deleteIn(['agents', idx, 'channels', channel])
      } else {
        doc.setIn(['agents', idx, 'channels', channel], value)
      }
    }
  }

  writeFileSync(configPath, doc.toString(), 'utf-8')
}
