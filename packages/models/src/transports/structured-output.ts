import { InvalidStructuredResponse, ModelResponseTooLarge } from "../errors.ts"

export async function readJsonBody(response: Response, maxBytes = 2_000_000): Promise<any> {
  if (!response.body) throw new InvalidStructuredResponse("Model response had no body.")
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new ModelResponseTooLarge() } chunks.push(value) }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new InvalidStructuredResponse("Model response was not valid JSON.") }
}

export function jsonOnlyMessages(messages: Array<{ role: string; content: string }>, schema?: { name: string; jsonSchema: Record<string, unknown> }) {
  if (!schema) return messages
  return [...messages, { role: "user", content: `Return only JSON matching schema ${schema.name}: ${JSON.stringify(schema.jsonSchema)}` }]
}
