import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void
  info(message: string, extra?: Record<string, unknown>): void
  warn(message: string, extra?: Record<string, unknown>): void
  error(message: string, extra?: Record<string, unknown>): void
}

function debugEnabled(): boolean {
  return process.env.MATHOS_DEBUG === "1" || process.env.MATHOS_DEBUG === "true"
}

function redact(text: string): string {
  const secrets = [process.env.MATHOS_API_KEY ?? "", process.env.OPENAI_API_KEY ?? ""].filter((item) => item.length > 3)
  let out = text
  for (const secret of secrets) out = out.split(secret).join("[redacted]")
  out = out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
  return out
}

function writeLine(filePath: string | undefined, level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (!filePath) return
  if (level === "debug" && !debugEnabled()) return
  mkdirSync(dirname(filePath), { recursive: true })
  const safeExtra = extra
    ? Object.fromEntries(
        Object.entries(extra).map(([key, value]) => {
          if (["apiKey", "api_key", "authorization", "MATHOS_API_KEY", "token", "password"].includes(key)) {
            return [key, "[redacted]"]
          }
          return [key, typeof value === "string" ? redact(value) : value]
        }),
      )
    : undefined
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message: redact(message),
    ...(safeExtra ?? {}),
  })
  appendFileSync(filePath, `${line}\n`, "utf8")
}

export function createLogger(filePath?: string): Logger {
  return {
    debug: (message, extra) => writeLine(filePath, "debug", message, extra),
    info: (message, extra) => writeLine(filePath, "info", message, extra),
    warn: (message, extra) => writeLine(filePath, "warn", message, extra),
    error: (message, extra) => writeLine(filePath, "error", message, extra),
  }
}

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}
