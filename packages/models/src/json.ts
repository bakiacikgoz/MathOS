import { InvalidStructuredResponse } from "./errors.ts"

export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.search(/[{\[]/)
    const endObj = trimmed.lastIndexOf("}")
    const endArr = trimmed.lastIndexOf("]")
    const end = Math.max(endObj, endArr)
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        throw new InvalidStructuredResponse("Response was not valid JSON.")
      }
    }
    throw new InvalidStructuredResponse("Response was not valid JSON.")
  }
}
