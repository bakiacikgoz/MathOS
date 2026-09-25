import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"
import { buildExternalClientEnvironment } from "./external-client-auth.ts"

// Sign-in for official-client providers (Codex, Claude Code, Gemini CLI, Qwen Code, Copilot).
// The vendor's own client owns the credentials; MathOS only starts its documented login flow and
// asks it whether the user is signed in. Every command here is a fixed constant, never user input.
// Sources (checked 2026-09-25): openai/codex codex-rs/cli/src/{main,login}.rs and README.md;
// anthropics/claude-code CHANGELOG.md ("claude auth login/status/logout") and README.md;
// google-gemini/gemini-cli, QwenLM/qwen-code and github/copilot-cli README.md.

export type LoginClientId = "codex" | "claude" | "gemini" | "qwen" | "copilot"
/** background: the client opens the browser and finishes on its own. window: sign-in happens inside the client's own terminal UI. */
export type ClientLoginMode = "background" | "window"
export interface ClientLoginSpec {
  client: LoginClientId
  displayName: string
  executable: string
  mode: ClientLoginMode
  loginArgs: string[]
  /** What to do inside the client's window, as a stable code the UI translates. */
  windowHint: string | null
  status: { args: string[]; signedIn: (result: { exitCode: number; stdout: string }) => boolean } | null
  install: { url: string; windows: string; unix: string }
}

export const CLIENT_LOGIN: Record<LoginClientId, ClientLoginSpec> = {
  codex: {
    client: "codex", displayName: "Codex", executable: "codex", mode: "background", loginArgs: ["login"], windowHint: null,
    // `codex login status` exits 0 when signed in (ChatGPT, API key or token) and 1 with "Not logged in".
    status: { args: ["login", "status"], signedIn: ({ exitCode }) => exitCode === 0 },
    install: { url: "https://developers.openai.com/codex/cli", windows: `powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"`, unix: "curl -fsSL https://chatgpt.com/codex/install.sh | sh" },
  },
  claude: {
    client: "claude", displayName: "Claude Code", executable: "claude", mode: "background", loginArgs: ["auth", "login"], windowHint: null,
    status: { args: ["auth", "status", "--json"], signedIn: ({ exitCode, stdout }) => exitCode === 0 && jsonField(stdout, "loggedIn") !== false },
    install: { url: "https://code.claude.com/docs/en/setup", windows: "irm https://claude.ai/install.ps1 | iex", unix: "curl -fsSL https://claude.ai/install.sh | bash" },
  },
  gemini: {
    client: "gemini", displayName: "Gemini CLI", executable: "gemini", mode: "window", loginArgs: [], windowHint: "gemini-sign-in", status: null,
    install: { url: "https://github.com/google-gemini/gemini-cli#-installation", windows: "npm install -g @google/gemini-cli", unix: "npm install -g @google/gemini-cli" },
  },
  qwen: {
    client: "qwen", displayName: "Qwen Code", executable: "qwen", mode: "window", loginArgs: [], windowHint: "qwen-auth", status: null,
    install: { url: "https://github.com/QwenLM/qwen-code#installation", windows: "npm install -g @qwen-code/qwen-code@latest", unix: "npm install -g @qwen-code/qwen-code@latest" },
  },
  copilot: {
    client: "copilot", displayName: "GitHub Copilot CLI", executable: "copilot", mode: "window", loginArgs: [], windowHint: "copilot-login", status: null,
    install: { url: "https://github.com/github/copilot-cli#installation", windows: "winget install GitHub.Copilot", unix: "npm install -g @github/copilot" },
  },
}

function jsonField(text: string, key: string): unknown {
  try { const value = JSON.parse(text) as Record<string, unknown>; return value && typeof value === "object" ? value[key] : undefined } catch { return undefined }
}

/** The login spec for a provider descriptor, from its official client id. */
export function clientLoginFor(descriptor: { id: string; externalClient?: { id: string } | null }): ClientLoginSpec | null {
  const id = descriptor.externalClient?.id ?? null
  return id && id in CLIENT_LOGIN ? CLIENT_LOGIN[id as LoginClientId] : null
}

export interface ClientLoginRuntime {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  which: (name: string) => string | null
  spawn: (argv: string[], options: { env: Record<string, string>; background: boolean }) => { exited: Promise<number>; stdout: Promise<string>; kill: () => void }
}

const EXTRA_ENV = ["PATHEXT", "ComSpec", "SystemDrive", "ProgramFiles", "ProgramData", "OS", "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "BROWSER", "TERM", "SHELL", "USER", "LOGNAME"]
export const clientEnvironment = (env: NodeJS.ProcessEnv) => buildExternalClientEnvironment(env, EXTRA_ENV)

/** How to run a client by name. On Windows npm installs `.cmd` shims, so cmd.exe resolves the name through PATH/PATHEXT. */
export function clientArgv(runtime: Pick<ClientLoginRuntime, "platform" | "which">, spec: ClientLoginSpec, args: string[]): string[] | null {
  const found = runtime.which(spec.executable)
  if (!found) return null
  return runtime.platform === "win32" ? ["cmd.exe", "/d", "/c", spec.executable, ...args] : [found, ...args]
}

export async function clientSignedIn(runtime: ClientLoginRuntime, spec: ClientLoginSpec, timeoutMs = 15_000): Promise<boolean | null> {
  if (!spec.status) return null
  const argv = clientArgv(runtime, spec, spec.status.args)
  if (!argv) return null
  const child = runtime.spawn(argv, { env: clientEnvironment(runtime.env), background: false })
  const timer = setTimeout(child.kill, timeoutMs)
  try { const [exitCode, stdout] = await Promise.all([child.exited, child.stdout]); return spec.status.signedIn({ exitCode, stdout }) }
  catch { return false } finally { clearTimeout(timer) }
}

/** Opens a visible terminal window running `command` (a fixed constant) so the user can watch and interact. */
export function terminalArgv(platform: NodeJS.Platform, command: string, which: (name: string) => string | null): string[] | null {
  if (platform === "win32") {
    // `start ""` opens a new console; -EncodedCommand avoids every quoting rule between cmd and PowerShell.
    const encoded = Buffer.from(command, "utf16le").toString("base64")
    return ["cmd.exe", "/d", "/c", "start", "", "powershell.exe", "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded]
  }
  if (platform === "darwin") {
    const script = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    return ["osascript", "-e", `tell application "Terminal" to do script "${script}"`, "-e", `tell application "Terminal" to activate`]
  }
  const keepOpen = `${command}; exec "\${SHELL:-sh}"`
  for (const [name, ...prefix] of [["x-terminal-emulator", "-e"], ["gnome-terminal", "--"], ["konsole", "-e"], ["xfce4-terminal", "-x"], ["xterm", "-e"]] as const) {
    if (which(name)) return [name, ...prefix, "sh", "-c", keepOpen]
  }
  return null
}

export type ClientLoginResult =
  | { state: "CLIENT_MISSING"; client: LoginClientId; install: ClientLoginSpec["install"] & { command: string } }
  | { state: "SIGNED_IN"; client: LoginClientId }
  /** Only from a check: not signed in (or, when `verifiable` is false, the client cannot tell). */
  | { state: "SIGNED_OUT"; client: LoginClientId; mode: ClientLoginMode; verifiable: boolean; hint: string | null }
  | { state: "LOGIN_STARTED"; client: LoginClientId }
  | { state: "LOGIN_WINDOW_OPENED"; client: LoginClientId; hint: string | null }
  | { state: "TERMINAL_UNAVAILABLE"; client: LoginClientId; command: string }

const running = new Map<LoginClientId, () => void>()
const LOGIN_TIMEOUT_MS = 10 * 60_000

/** Starts the client's sign-in. `window` forces the client's own terminal UI (for when the browser flow cannot reach localhost). */
export async function startClientLogin(runtime: ClientLoginRuntime, spec: ClientLoginSpec, options: { window?: boolean; check?: boolean } = {}): Promise<ClientLoginResult> {
  const install = { ...spec.install, command: runtime.platform === "win32" ? spec.install.windows : spec.install.unix }
  if (!runtime.which(spec.executable)) return { state: "CLIENT_MISSING", client: spec.client, install }
  if (await clientSignedIn(runtime, spec)) { running.get(spec.client)?.(); return { state: "SIGNED_IN", client: spec.client } }
  if (options.check) return { state: "SIGNED_OUT", client: spec.client, mode: spec.mode, verifiable: spec.status !== null, hint: spec.windowHint }
  const env = clientEnvironment(runtime.env)
  if (spec.mode === "background" && !options.window) {
    running.get(spec.client)?.()
    const child = runtime.spawn(clientArgv(runtime, spec, spec.loginArgs)!, { env, background: true })
    const timer = setTimeout(child.kill, LOGIN_TIMEOUT_MS)
    const stop = () => { clearTimeout(timer); child.kill() }
    running.set(spec.client, stop)
    void child.exited.finally(() => { clearTimeout(timer); if (running.get(spec.client) === stop) running.delete(spec.client) })
    return { state: "LOGIN_STARTED", client: spec.client }
  }
  const command = [spec.executable, ...spec.loginArgs].join(" ")
  const argv = terminalArgv(runtime.platform, command, runtime.which)
  if (!argv) return { state: "TERMINAL_UNAVAILABLE", client: spec.client, command }
  const child = runtime.spawn(argv, { env, background: true })
  if (await child.exited.catch(() => 1) !== 0 && runtime.platform !== "linux") return { state: "TERMINAL_UNAVAILABLE", client: spec.client, command }
  return { state: "LOGIN_WINDOW_OPENED", client: spec.client, hint: spec.windowHint }
}

/** Runs the client's official installer in a visible terminal window. */
export async function openClientInstaller(runtime: ClientLoginRuntime, spec: ClientLoginSpec): Promise<{ opened: boolean; command: string; url: string }> {
  const command = runtime.platform === "win32" ? spec.install.windows : spec.install.unix
  const argv = terminalArgv(runtime.platform, command, runtime.which)
  if (!argv) return { opened: false, command, url: spec.install.url }
  const child = runtime.spawn(argv, { env: clientEnvironment(runtime.env), background: true })
  const code = runtime.platform === "linux" ? 0 : await child.exited.catch(() => 1)
  return { opened: code === 0, command, url: spec.install.url }
}

/**
 * Apps started from the Dock/Start menu get a minimal PATH, so clients installed with Homebrew, npm
 * or the vendor installers are not found. Adds the usual install locations (and, on Windows, the
 * current registry PATH so a client installed after MathOS started is found without a restart).
 */
export function clientSearchPath(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, discovered: string | null = null): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir()
  const sep = platform === "win32" ? ";" : delimiter
  const current = (env.PATH ?? env.Path ?? "").split(sep).filter(Boolean)
  const extra = platform === "win32"
    ? [...(discovered ?? "").split(";"), env.APPDATA && join(env.APPDATA, "npm"), join(home, ".local", "bin"), env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Links"), join(home, ".bun", "bin")]
    : [...(discovered ?? "").split(":"), "/opt/homebrew/bin", "/usr/local/bin", join(home, ".local", "bin"), join(home, ".npm-global", "bin"), join(home, ".bun", "bin"), join(home, ".volta", "bin"), join(home, ".codex", "bin")]
  const seen = new Set<string>(), out: string[] = []
  for (const dir of [...current, ...extra]) {
    if (!dir) continue
    const key = platform === "win32" ? dir.toLowerCase() : dir
    if (seen.has(key)) continue
    if (!current.includes(dir) && !existsSync(dir)) continue
    seen.add(key); out.push(dir)
  }
  return out.join(sep)
}

let discoveredCache: { at: number; value: string | null } | null = null
/** The PATH a freshly opened terminal would get: the registry on Windows, the login shell on macOS. Cached for 5 s. */
function discoveredPath(env: NodeJS.ProcessEnv): string | null {
  if (discoveredCache && Date.now() - discoveredCache.at < 5_000) return discoveredCache.value
  let value: string | null = null
  try {
    const argv = process.platform === "win32" ? ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')"]
      : process.platform === "darwin" ? [env.SHELL || "/bin/zsh", "-ilc", 'printf "%s" "$PATH"'] : null
    if (argv) { const out = Bun.spawnSync(argv, { stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: 4_000, windowsHide: true }); if (out.exitCode === 0) value = out.stdout.toString().trim() || null }
  } catch {}
  discoveredCache = { at: Date.now(), value }
  return value
}

export function bunClientRuntime(env: NodeJS.ProcessEnv = process.env): ClientLoginRuntime {
  const path = clientSearchPath(process.platform, env, discoveredPath(env))
  const lookupEnv = { ...env, PATH: path }
  return {
    platform: process.platform,
    env: lookupEnv,
    which: (name) => Bun.which(name, { PATH: path }),
    spawn: (argv, options) => {
      // A background login keeps stdin open (never written) so a client that offers "paste the code" does not see EOF and quit.
      const child = Bun.spawn(argv, { env: { ...options.env, PATH: path }, stdin: options.background ? "pipe" : "ignore", stdout: options.background ? "ignore" : "pipe", stderr: "ignore", windowsHide: true })
      if (options.background) child.unref()
      return { exited: child.exited, stdout: options.background || typeof child.stdout === "number" || !child.stdout ? Promise.resolve("") : new Response(child.stdout).text(), kill: () => { try { child.kill() } catch {} } }
    },
  }
}
