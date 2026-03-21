export interface ChannelTarget {
  /** Channel-specific identifier (e.g. Telegram chat ID, Discord channel ID) */
  id: string
  /** Optional thread/topic identifier */
  threadId?: string
}

export interface Attachment {
  type: 'image' | 'audio' | 'video' | 'file'
  url?: string
  mimeType?: string
  size?: number
}

export interface InboundMessage {
  /** Unique message ID within the channel */
  messageId: string
  /** The channel target this message came from */
  source: ChannelTarget
  /** The user who sent it */
  userId: string
  /** Display name of the user */
  userName?: string
  /** The text content */
  text: string
  /** Unix timestamp in seconds */
  timestamp: number
  /** Whether this message is from a group chat */
  isGroup?: boolean
  /** Whether the bot was mentioned in the message */
  mentionsBot?: boolean
  /** Attached media */
  attachments?: Attachment[]
}

export interface OutboundMessage {
  /** Text to send */
  text: string
  /** Whether to parse as Markdown */
  parseMode?: 'markdown' | 'html' | 'plain'
  /** Reply to a specific message ID */
  replyToMessageId?: string
}

export type MessageHandler = (message: InboundMessage) => Promise<void>

export interface ChannelAdapter {
  /** Start listening for messages */
  start(): Promise<void>
  /** Gracefully stop */
  stop(): Promise<void>
  /** Send a message to a target */
  send(target: ChannelTarget, msg: OutboundMessage): Promise<void>
  /** Register the handler that will be called for each inbound message */
  onMessage(handler: MessageHandler): void
  /** Channel type identifier */
  readonly channelType: string
}
