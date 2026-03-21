import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  ChannelAdapter,
  ChannelTarget,
  MessageHandler,
  OutboundMessage,
} from '@openaios/core'
import { logger } from '@openaios/core'
import { chunkMessage } from '../shared/message-chunker.js'

const execFileAsync = promisify(execFile)
const MAX_MESSAGE_LENGTH = 4096

export interface IMessageAdapterOptions {
  /** Poll interval in milliseconds for new messages */
  pollIntervalMs?: number
}

/**
 * iMessage adapter using AppleScript (macOS only).
 * Polls for new messages via osascript.
 */
export class IMessageAdapter implements ChannelAdapter {
  readonly channelType = 'imessage'
  private handler?: MessageHandler
  private pollInterval: ReturnType<typeof setInterval> | undefined = undefined
  private pollIntervalMs: number

  constructor(options?: IMessageAdapterOptions) {
    this.pollIntervalMs = options?.pollIntervalMs ?? 5000
  }

  async start(): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new Error('iMessage adapter is only available on macOS')
    }

    this.lastCheckTime = Date.now()
    this.pollInterval = setInterval(() => {
      void this.poll()
    }, this.pollIntervalMs)

    logger.info('[imessage]', 'iMessage adapter started (polling)')
  }

  async stop(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = undefined
    }
  }

  async send(target: ChannelTarget, msg: OutboundMessage): Promise<void> {
    const chunks = chunkMessage(msg.text, MAX_MESSAGE_LENGTH)
    for (const chunk of chunks) {
      const escaped = chunk.replace(/"/g, '\\"')
      const script = `tell application "Messages"
  set targetBuddy to buddy "${target.id}" of service 1
  send "${escaped}" to targetBuddy
end tell`
      try {
        await execFileAsync('osascript', ['-e', script])
      } catch (err) {
        logger.error(
          '[imessage]',
          `Send failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }

  private async poll(): Promise<void> {
    if (!this.handler) return

    try {
      // Query Messages.app for recent messages via AppleScript
      const script = `tell application "Messages"
  set recentMessages to {}
  repeat with aChat in chats
    repeat with aMsg in messages of aChat
      if date received of aMsg > (current date) - 30 then
        set end of recentMessages to {id of aMsg, name of sender of aMsg, text of aMsg}
      end if
    end repeat
  end repeat
  return recentMessages
end tell`

      const { stdout } = await execFileAsync('osascript', ['-e', script], {
        timeout: 5000,
      })

      // Parse would happen here — for now this is a structural implementation
      // Real parsing depends on AppleScript output format
      if (stdout.trim()) {
        logger.debug(
          '[imessage]',
          `Poll result: ${stdout.trim().slice(0, 100)}`,
        )
      }
    } catch {
      // Polling errors are expected (no new messages, permissions, etc.)
    }
  }
}
