export const DESKTOP_HOST_PROTOCOL = "mathos.desktop-host.v1"

export interface HostRequest { id: string; cwd: string; args: string[] }
export interface HostResponse { protocol: typeof DESKTOP_HOST_PROTOCOL; id: string; code: number; stdout: string; stderr: string; ms: number }
export interface HostReady { protocol: typeof DESKTOP_HOST_PROTOCOL; type: "ready"; version: string; pid: number }

export function parseHostRequest(line: string): HostRequest {
  let value: unknown
  try { value = JSON.parse(line) } catch { throw new Error("DESKTOP_HOST_REQUEST_INVALID: not JSON") }
  const row = value as Partial<HostRequest> | null
  if (!row || typeof row !== "object") throw new Error("DESKTOP_HOST_REQUEST_INVALID: not an object")
  if (typeof row.id !== "string" || row.id.length === 0 || row.id.length > 128) throw new Error("DESKTOP_HOST_REQUEST_INVALID: id")
  if (typeof row.cwd !== "string" || row.cwd.length === 0) throw new Error("DESKTOP_HOST_REQUEST_INVALID: cwd")
  if (!Array.isArray(row.args) || row.args.length > 256 || !row.args.every((item) => typeof item === "string")) throw new Error("DESKTOP_HOST_REQUEST_INVALID: args")
  return { id: row.id, cwd: row.cwd, args: row.args }
}

/** Commands that need a terminal, read stdin, or never return cannot run inside the shared desktop host. */
export function blockedCommandReason(args: string[]): string | null {
  const [command, sub] = args
  const rest = args.slice(1)
  if (!command) return "The interactive TUI runs in a terminal. Use the desktop views instead."
  if (command === "bridge") return "The editor bridge owns its own process."
  if (command === "secrets" && sub === "set") return "Secrets are entered interactively. Run `mathos secrets set` in a terminal."
  if (command === "provider" && sub === "login") return "Provider login opens an interactive flow. Run `mathos provider login` in a terminal."
  if (command === "atlas" && (rest.length === 0 || sub === "open" || rest.includes("--no-open"))) return "Atlas runs a long-lived server. Run `mathos atlas` in a terminal."
  if (command === "update" && (sub === "apply" || sub === "rollback")) return "Updates replace the running binary. Run them from a terminal."
  return null
}

export function createLineSplitter(onLine: (line: string) => void) {
  let buffer = ""
  return (chunk: string) => {
    buffer += chunk
    let index = buffer.indexOf("\n")
    while (index !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, "")
      buffer = buffer.slice(index + 1)
      if (line.trim()) onLine(line)
      index = buffer.indexOf("\n")
    }
  }
}
