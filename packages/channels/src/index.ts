export { DiscordAdapter } from './discord/adapter.js'
export {
  GoogleChatAdapter,
  type GoogleChatAdapterOptions,
} from './google-chat/adapter.js'
export {
  IMessageAdapter,
  type IMessageAdapterOptions,
} from './imessage/adapter.js'
export { DmAllowlist } from './shared/dm-allowlist.js'
export { shouldProcessGroupMessage } from './shared/group-router.js'
export {
  filterAttachments,
  type MediaLimitsConfig,
} from './shared/media-limits.js'
// Shared utilities
export { chunkMessage } from './shared/message-chunker.js'
export { ReplyThreader } from './shared/reply-threader.js'
export {
  SignalAdapter,
  type SignalAdapterOptions,
} from './signal/adapter.js'
export { SlackAdapter, type SlackAdapterOptions } from './slack/adapter.js'
export { TelegramAdapter } from './telegram/adapter.js'
export { WebhookAdapter } from './webhook/adapter.js'
export {
  WhatsAppAdapter,
  type WhatsAppAdapterOptions,
} from './whatsapp/adapter.js'
