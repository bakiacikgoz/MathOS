import { ModelResponseTooLarge } from "../errors.ts"

/**
 * Deadline for a streamed answer: it may run for minutes while it keeps producing output, so the profile's timeout
 * applies to silence between chunks rather than to the whole answer (which still has a hard ceiling).
 */
export function streamDeadline(idleMs: number, external?: AbortSignal, totalMs = 15 * 60_000) {
  const controller = new AbortController()
  let idle = setTimeout(() => controller.abort(), idleMs)
  const total = setTimeout(() => controller.abort(), totalMs)
  return {
    signal: external ? AbortSignal.any([controller.signal, external]) : controller.signal,
    touch() { clearTimeout(idle); idle = setTimeout(() => controller.abort(), idleMs) },
    dispose() { clearTimeout(idle); clearTimeout(total) },
    get timedOut() { return controller.signal.aborted },
  }
}

/** Reads a server-sent event stream, calling `onEvent` with each event's data (and name, when given). */
export async function readSse(response: Response, onEvent: (data: string, event: string | null) => void, options: { maxBytes?: number; touch?: () => void } = {}): Promise<void> {
  if (!response.body) return
  const reader = response.body.getReader(), decoder = new TextDecoder(), maxBytes = options.maxBytes ?? 20_000_000
  let buffer = "", size = 0
  const flush = (block: string) => {
    let event: string | null = null
    const data: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""))
      else if (line.startsWith("event:")) event = line.slice(6).trim()
    }
    if (data.length) onEvent(data.join("\n"), event)
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      options.touch?.()
      size += value.byteLength
      if (size > maxBytes) { await reader.cancel(); throw new ModelResponseTooLarge() }
      buffer += decoder.decode(value, { stream: true })
      let index = buffer.search(/\r?\n\r?\n/)
      while (index !== -1) {
        const match = /\r?\n\r?\n/.exec(buffer.slice(index))!
        flush(buffer.slice(0, index))
        buffer = buffer.slice(index + match[0].length)
        index = buffer.search(/\r?\n\r?\n/)
      }
    }
    if (buffer.trim()) flush(buffer)
  } finally { reader.releaseLock() }
}

export const parseJsonEvent = (data: string): any => { try { return JSON.parse(data) } catch { return null } }
