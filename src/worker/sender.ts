// Builds Baileys message content from the app's OutgoingContent and sends it with optional
// human-like typing simulation. Anti-ban pacing (delays/caps) lives in the main scheduler;
// this only adds the per-message presence/typing touch.

import type { WASocket, AnyMessageContent } from '@whiskeysockets/baileys'
import type { OutgoingContent } from '@shared/events'
import { typingDurationMs } from '@shared/logic/rate-limiter'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function buildContent(content: OutgoingContent): AnyMessageContent {
  if (content.mediaPath) {
    const file = { url: content.mediaPath }
    switch (content.mediaType) {
      case 'image':
        return { image: file, caption: content.caption }
      case 'video':
        return { video: file, caption: content.caption }
      case 'audio':
        return { audio: file, ptt: true, mimetype: 'audio/ogg; codecs=opus' }
      case 'document':
        return {
          document: file,
          mimetype: 'application/octet-stream',
          fileName: content.fileName ?? 'file',
          caption: content.caption
        }
      default:
        // Unknown media type: fall back to document so we never silently drop it.
        return { document: file, mimetype: 'application/octet-stream', fileName: content.fileName ?? 'file' }
    }
  }
  return { text: content.text ?? '' }
}

export async function sendMessage(
  sock: WASocket,
  jid: string,
  content: OutgoingContent,
  simulateTyping = true
): Promise<string | null> {
  if (simulateTyping) {
    const len = (content.text ?? content.caption ?? '').length
    try {
      await sock.sendPresenceUpdate('composing', jid)
      await delay(typingDurationMs(len))
      await sock.sendPresenceUpdate('paused', jid)
    } catch {
      // presence is best-effort; never block the actual send on it
    }
  }
  const result = await sock.sendMessage(jid, buildContent(content))
  return result?.key?.id ?? null
}
