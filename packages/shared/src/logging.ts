import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs"
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
  const secrets = Object.entries(process.env).filter(([name, value]) => /(api[_-]?key|secret|token|password|authorization|credential)/i.test(name) && Boolean(value)).map(([, value]) => value!).filter((item) => item.length > 3)
  let out = text
  for (const secret of secrets) out = out.split(secret).join("[redacted]")
  out = out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
  out = out.replace(/(?:[A-Za-z]:\\|\/)(?:[^\s"']+[\\/])+[^\s"']+/g, "[path]")
  return out
}

function writeLine(filePath: string | undefined, level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (!filePath) return
  if (level === "debug" && !debugEnabled()) return
  mkdirSync(dirname(filePath), { recursive: true })
  const sanitize = (value: unknown, key = ""): unknown => {
    if (/(api[_-]?key|secret|token|password|authorization|credential)/i.test(key)) return value ? "[redacted]" : value
    if (typeof value === "string") return redact(value)
    if (Array.isArray(value)) return value.map(item => sanitize(item))
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([nestedKey, nested]) => [nestedKey, sanitize(nested, nestedKey)]))
    return value
  }
  const safeExtra = extra ? sanitize(extra) as Record<string, unknown> : undefined
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message: redact(message),
    ...(safeExtra ?? {}),
  })
  appendFileSync(filePath, `${line}\n`, "utf8")
}

export function createLogger(filePath?: string,options:{maxBytes?:number;maxFiles?:number}={}): Logger {
  const rotate=()=>{if(!filePath||!existsSync(filePath)||statSync(filePath).size<(options.maxBytes??2_000_000))return;const count=Math.max(1,options.maxFiles??3);rmSync(`${filePath}.${count}`,{force:true});for(let i=count-1;i>=1;i--)if(existsSync(`${filePath}.${i}`))renameSync(`${filePath}.${i}`,`${filePath}.${i+1}`);renameSync(filePath,`${filePath}.1`)}
  return {
    debug: (message, extra) => {rotate();writeLine(filePath, "debug", message, extra)},
    info: (message, extra) => {rotate();writeLine(filePath, "info", message, extra)},
    warn: (message, extra) => {rotate();writeLine(filePath, "warn", message, extra)},
    error: (message, extra) => {rotate();writeLine(filePath, "error", message, extra)},
  }
}

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}
