import { BRClient } from '@openaios/br-sdk'

type HookEvent = 'pre-tool-use' | 'post-tool-use' | 'stop'

/**
 * Claude Code passes hook event data as JSON on stdin.
 * See: https://docs.anthropic.com/en/docs/claude-code/hooks
 */
interface PreToolUseInput {
  tool_name: string
  tool_input: Record<string, unknown>
  session_id: string
}

interface PostToolUseInput extends PreToolUseInput {
  tool_output: unknown
}

interface StopInput {
  session_id: string
  cost_usd?: number
  input_tokens?: number
  output_tokens?: number
}

export async function runHook(event: HookEvent): Promise<void> {
  const brUrl = process.env['BR_URL']
  const brToken = process.env['BR_TOKEN']
  const agentName = process.env['BR_AGENT'] ?? 'unknown'

  if (!brUrl || !brToken) {
    // No BR configured — exit silently (hook still succeeds)
    process.exit(0)
  }

  const client = new BRClient({ url: brUrl, token: brToken, timeoutMs: 1000 })

  const stdinData = await readStdin()
  let input: unknown
  try {
    input = JSON.parse(stdinData)
  } catch {
    process.exit(0)
  }

  try {
    switch (event) {
      case 'pre-tool-use': {
        const data = input as PreToolUseInput
        // Policy check — if denied, output a JSON block with "decision": "block"
        const rules = await client.getPolicyRules(agentName)
        const rule = rules.find((r) => r.tool === data.tool_name)
        if (rule && !rule.allowed) {
          // Output block decision to stdout for Claude Code to read
          process.stdout.write(
            JSON.stringify({
              decision: 'block',
              reason: rule.reason ?? `Tool "${data.tool_name}" blocked by BR policy`,
            })
          )
          process.exit(0)
        }
        break
      }

      case 'post-tool-use': {
        const data = input as PostToolUseInput
        await client.reportUsage({
          agentId: agentName,
          period: currentPeriod(),
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
        })
        void data // usage reporting — extend with real token data when available
        break
      }

      case 'stop': {
        const data = input as StopInput
        if (data.cost_usd) {
          await client.reportUsage({
            agentId: agentName,
            period: currentPeriod(),
            costUsd: data.cost_usd,
            inputTokens: data.input_tokens ?? 0,
            outputTokens: data.output_tokens ?? 0,
          })
        }
        break
      }
    }
  } catch {
    // Hooks must not block Claude Code — exit 0 on any error
  }

  process.exit(0)
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk: string) => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    // If stdin is a TTY or not connected, resolve immediately
    if (process.stdin.isTTY) resolve('')
  })
}

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
