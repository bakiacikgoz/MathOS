export const DESKTOP_HOST_PROTOCOL = "mathos.desktop-host.v1"

export interface HostRequest { id: string; cwd: string; args: string[] }
/** Stores a provider key in the OS secret store. The value travels only over the host's stdin, never argv or output. */
export interface SecretSetRequest { id: string; op: "secret-set"; ref: string; value: string }
export const SECRET_REF_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i
export interface HostResponse { protocol: typeof DESKTOP_HOST_PROTOCOL; id: string; code: number; stdout: string; stderr: string; ms: number }
export interface HostReady { protocol: typeof DESKTOP_HOST_PROTOCOL; type: "ready"; version: string; pid: number }

export function parseHostMessage(line: string): HostRequest | SecretSetRequest {
  let value: unknown
  try { value = JSON.parse(line) } catch { throw new Error("DESKTOP_HOST_REQUEST_INVALID: not JSON") }
  const row = value as Partial<SecretSetRequest> | null
  if (row && typeof row === "object" && row.op === "secret-set") {
    if (typeof row.id !== "string" || row.id.length === 0 || row.id.length > 128) throw new Error("DESKTOP_HOST_REQUEST_INVALID: id")
    if (typeof row.ref !== "string" || !SECRET_REF_PATTERN.test(row.ref)) throw new Error("DESKTOP_HOST_REQUEST_INVALID: ref")
    if (typeof row.value !== "string" || !row.value.trim() || row.value.length > 8192 || /[\r\n\0]/.test(row.value)) throw new Error("SECRET_VALUE_INVALID")
    return { id: row.id, op: "secret-set", ref: row.ref, value: row.value.trim() }
  }
  return parseHostRequest(line)
}

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
  if (command === "secrets" && sub === "set") return "Enter keys in Model Providers, or run `mathos secrets set` in a terminal."
  // With --json the CLI starts the client's sign-in in the background (or in its own window); without it, it would take over this process's terminal.
  if (command === "provider" && sub === "login" && !rest.includes("--json")) return "Provider login opens an interactive flow. Run `mathos provider login` in a terminal."
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
